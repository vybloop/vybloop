// Per-project sandbox images. A repo extends its sandbox with, in `.loop/`:
//   sandbox.json        { "use": ["blender", …] } — layers from the shared
//                       library (sandbox-layers.js)
//   sandbox.Dockerfile  its own Dockerfile *fragment* (RUN/ENV/COPY…, no FROM),
//                       built with `.loop/` as the context
// Loop stacks them on the base `claude-inner` image: library layers in id order
// (a fixed order, so projects sharing layers share their cached prefix), then
// the repo's fragment. Tools a project needs then survive across sessions and
// workstreams instead of being reinstalled by setup scripts every time.
//
// Images are content-addressed: tagged `loop-sandbox:<hash>` of the base image
// id, the library layers used and the rest of `.loop/`. Workstreams (and
// projects) with the same inputs share one image, an unchanged setup costs only
// an `image exists` check, and any edit yields a new tag on the next session
// start. The agent
// CLIs come from the loop-agents volume (agent-toolchain.js), so updating them
// never invalidates these images.
//
// The build runs inside the terminal session itself (see sandboxCommand), so its
// output streams to the agent/shell tab the user is already looking at.
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  existsSync, readFileSync, readdirSync, lstatSync, readlinkSync, mkdirSync, writeFileSync, unlinkSync,
} from 'fs';
import { join } from 'path';
import { getLayer, layerFragmentError } from './sandbox-layers.js';

const execFileAsync = promisify(execFile);

export const BASE_IMAGE = 'claude-inner';
const IMAGE_REPO = 'loop-sandbox';
const CONTEXT_DIR = '.loop';
const FRAGMENT = `${CONTEXT_DIR}/sandbox.Dockerfile`;
const CONFIG_NAME = 'sandbox.json';
const CONFIG = `${CONTEXT_DIR}/${CONFIG_NAME}`;
// Generated Dockerfiles live outside the repo, so the build context stays the
// repo's own `.loop/` and building never dirties the working tree.
const BUILD_DIR = '/tmp/loop-sandbox';

// Stands in for the image name in a session's `podman run` argv until
// sandboxCommand knows which image the session ends up on.
export const IMAGE_PLACEHOLDER = '__LOOP_SANDBOX_IMAGE__';

// The base image only changes when start.sh rebuilds it, i.e. before the backend
// starts — so its id is fixed for this process.
let baseImageId = null;
async function getBaseImageId() {
  if (!baseImageId) {
    const { stdout } = await execFileAsync('podman', [
      'image', 'inspect', BASE_IMAGE, '--format', '{{.Id}}',
    ], { timeout: 30_000 });
    baseImageId = stdout.trim();
  }
  return baseImageId;
}

// Hash of every path, file and symlink target under dir, in a stable order.
// Top-level names in `skip` are left out.
function hashTree(hash, dir, rel = '', skip = new Set()) {
  if (!existsSync(join(dir, rel))) return;
  for (const name of readdirSync(join(dir, rel)).sort()) {
    if (!rel && skip.has(name)) continue;
    const path = rel ? `${rel}/${name}` : name;
    const stat = lstatSync(join(dir, path));
    if (stat.isDirectory()) {
      hash.update(`d\0${path}\0`);
      hashTree(hash, dir, path);
    } else if (stat.isSymbolicLink()) {
      hash.update(`l\0${path}\0${readlinkSync(join(dir, path))}\0`);
    } else if (stat.isFile()) {
      hash.update(`f\0${path}\0${stat.mode & 0o111 ? 'x' : '-'}\0`);
      hash.update(readFileSync(join(dir, path)));
      hash.update('\0');
    }
  }
}

// The project's `.loop/sandbox.json` as { use: [layer ids] }. Throws on a file
// that isn't valid JSON.
export function readSandboxConfig(repoPath) {
  const path = join(repoPath, CONFIG);
  if (!existsSync(path)) return { use: [] };
  const config = JSON.parse(readFileSync(path, 'utf8'));
  const use = Array.isArray(config?.use) ? config.use.filter(id => typeof id === 'string') : [];
  return { ...config, use };
}

// Write `use` (sorted, deduplicated) back to `.loop/sandbox.json`, keeping any
// other keys. Removes the file when nothing is left in it.
export function writeSandboxConfig(repoPath, use) {
  const path = join(repoPath, CONFIG);
  let config = {};
  try { config = readSandboxConfig(repoPath); } catch {}
  config.use = [...new Set(use)].sort();
  if (config.use.length === 0) delete config.use;
  if (Object.keys(config).length === 0) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  mkdirSync(join(repoPath, CONTEXT_DIR), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

export function readSandboxFragment(repoPath) {
  const path = join(repoPath, FRAGMENT);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

export function removeSandboxFragment(repoPath) {
  const path = join(repoPath, FRAGMENT);
  if (existsSync(path)) unlinkSync(path);
}

// The image a repo's sandbox should run on, without building anything:
//   { tag, dockerfile, layers, warnings }  — tag is the content address and
//                                            dockerfile the text to build it
//   { error, warnings }                    — the repo's setup can't be used
//   { warnings }                           — nothing to add; use the base image
async function resolveSandbox(repoPath) {
  const warnings = [];
  let config;
  try {
    config = readSandboxConfig(repoPath);
  } catch (err) {
    return { error: `${CONFIG} is not valid JSON (${err.message}).`, warnings };
  }
  const fragment = readSandboxFragment(repoPath);
  // A FROM would start a new stage and drop the base image (and with it the
  // /opt/loop links the agent CLIs are reached through).
  if (fragment !== null && /^\s*FROM\s/im.test(fragment)) {
    return { error: `${FRAGMENT} must not contain FROM — it is layered on Loop's base sandbox image.`, warnings };
  }

  const layers = [];
  for (const id of [...new Set(config.use)].sort()) {
    const layer = getLayer(id);
    const problem = !layer ? 'is not in the library' : layerFragmentError(layer.fragment);
    if (problem) warnings.push(`Skipping library layer "${id}" from ${CONFIG}: ${problem}`);
    else layers.push(layer);
  }
  if (layers.length === 0 && fragment === null) return { warnings };

  const hash = createHash('sha256');
  hash.update(`${await getBaseImageId()}\0`);
  for (const layer of layers) hash.update(`layer\0${layer.id}\0${layer.fragment}\0`);
  // sandbox.json is covered by the layers above; leaving it out lets repos that
  // list the same layers in a different order or format share one image.
  hashTree(hash, join(repoPath, CONTEXT_DIR), '', new Set([CONFIG_NAME]));

  const dockerfile = [
    `FROM ${BASE_IMAGE}`,
    ...layers.map(l => `# Library layer: ${l.id}\n${l.fragment.trim()}`),
    ...(fragment !== null ? [`# ${FRAGMENT}\n${fragment.trim()}`] : []),
  ].join('\n\n');
  return {
    tag: `${IMAGE_REPO}:${hash.digest('hex').slice(0, 16)}`,
    dockerfile: `${dockerfile}\n`,
    layers: layers.map(l => l.id),
    warnings,
  };
}

// What the project's sandbox resolves to right now, for the UI.
export async function describeSandbox(repoPath) {
  let resolved;
  try {
    resolved = await resolveSandbox(repoPath);
  } catch (err) {
    resolved = { error: `Could not read ${CONTEXT_DIR}/: ${err.message}`, warnings: [] };
  }
  const image = resolved.tag || BASE_IMAGE;
  return {
    image,
    built: resolved.tag ? await imageExists(resolved.tag) : true,
    layers: resolved.layers || [],
    error: resolved.error || null,
    warnings: resolved.warnings,
  };
}

async function imageExists(tag) {
  try {
    await execFileAsync('podman', ['image', 'exists', tag], { timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

// What a session starting now needs: { image } when it can start right away, or
// a build/warning step to run in the terminal first. Never throws — any problem
// degrades to the base image with a warning shown in the terminal.
export async function prepareSandbox(repoPath) {
  let resolved;
  try {
    resolved = await resolveSandbox(repoPath);
  } catch (err) {
    resolved = { error: `Could not read ${CONTEXT_DIR}/: ${err.message}`, warnings: [] };
  }
  const notes = [...resolved.warnings];
  if (resolved.error) notes.push(`${resolved.error} Starting on the base image.`);
  const warning = notes.join('\n') || undefined;
  if (!resolved.tag) return { image: BASE_IMAGE, warning };
  if (await imageExists(resolved.tag)) return { image: resolved.tag, warning };

  mkdirSync(BUILD_DIR, { recursive: true });
  const dockerfile = join(BUILD_DIR, `${resolved.tag.split(':')[1]}.Dockerfile`);
  writeFileSync(dockerfile, resolved.dockerfile);
  // podman needs a context directory even when only library layers are used.
  const context = join(repoPath, CONTEXT_DIR);
  mkdirSync(context, { recursive: true });
  return {
    image: resolved.tag,
    warning,
    build: { tag: resolved.tag, dockerfile, context },
  };
}

// Builds (if needed) then execs the session's `podman run`, all inside the PTY:
//   $1 warning  $2 tag  $3 dockerfile  $4 context  $5 base image  $6… run argv
// The agent and shell tabs, or two workstreams with the same .loop/, can start
// the same build at once; flock makes the later ones wait and then find the
// image already there. A failed build falls back to the base image so the agent
// still starts — and can fix the fragment.
const BUILD_SCRIPT = `
warning=$1 tag=$2 dockerfile=$3 context=$4 img=$5
shift 5
if [ -n "$warning" ]; then
  printf '\\033[33m%s\\033[0m\\n' "$warning"
  sleep 3
fi
if [ -n "$tag" ]; then
  exec 9>"$dockerfile.lock"
  if ! flock -n 9; then
    printf 'Waiting for another session building this sandbox image...\\n'
    flock 9
  fi
  if podman image exists "$tag"; then
    img=$tag
  else
    printf '\\033[36mBuilding sandbox image from ${CONTEXT_DIR}/ ...\\033[0m\\n'
    if podman build --pull=never --label loop.sandbox=1 -t "$tag" -f "$dockerfile" "$context"; then
      img=$tag
    else
      printf '\\033[31mSandbox image build failed - starting on the base image. Fix ${FRAGMENT} or the layers in ${CONFIG}, then restart the sandbox.\\033[0m\\n'
      sleep 5
    fi
  fi
  exec 9>&-
fi
for arg; do
  shift
  [ "$arg" = "${IMAGE_PLACEHOLDER}" ] && arg=$img
  set -- "$@" "$arg"
done
exec "$@"
`;

// The argv to spawn for a session, given its `podman run` argv (with
// IMAGE_PLACEHOLDER as the image) and the result of prepareSandbox.
export function sandboxCommand(sandbox, runArgv) {
  if (!sandbox.build && !sandbox.warning) {
    return runArgv.map(a => (a === IMAGE_PLACEHOLDER ? sandbox.image : a));
  }
  const { tag = '', dockerfile = '', context = '' } = sandbox.build || {};
  return [
    'sh', '-c', BUILD_SCRIPT, 'loop-sandbox',
    sandbox.warning || '', tag, dockerfile, context, BASE_IMAGE,
    ...runArgv,
  ];
}

// Remove `loop-sandbox:*` images no project's current `.loop/` resolves to —
// left behind by edited fragments and deleted projects. `podman rmi` without -f
// refuses images a container still uses, so a running sandbox keeps its image.
// Layers shared with a current image stay, so a rebuild after a small edit is
// still mostly cached.
export async function pruneSandboxImages(repoPaths) {
  const keep = new Set();
  for (const repoPath of repoPaths) {
    const resolved = await resolveSandbox(repoPath).catch(() => null);
    if (resolved?.tag) keep.add(resolved.tag);
  }
  const { stdout } = await execFileAsync('podman', [
    'images', '--filter', 'label=loop.sandbox=1', '--format', '{{.Repository}}:{{.Tag}}',
  ], { timeout: 30_000 });
  const stale = stdout.trim().split('\n').filter(Boolean)
    .map(ref => ref.replace(/^localhost\//, ''))
    .filter(tag => tag.startsWith(`${IMAGE_REPO}:`) && !keep.has(tag));
  for (const tag of stale) {
    try {
      await execFileAsync('podman', ['rmi', tag], { timeout: 120_000 });
      console.log(`[sandbox] removed unused image ${tag}`);
    } catch {
      // Still in use by a running sandbox — try again next time.
    }
  }
}
