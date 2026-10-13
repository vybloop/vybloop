// Per-project sandbox images. A repo extends its sandbox with
// `.loop/sandbox.Dockerfile` — a Dockerfile *fragment* (RUN/ENV/COPY…, no FROM)
// that Loop layers on the base `claude-inner` image, with `.loop/` as the build
// context. Tools a project needs then survive across sessions and workstreams
// instead of being reinstalled by setup scripts every time.
//
// Images are content-addressed: tagged `loop-sandbox:<hash>` of the base image
// id plus everything in `.loop/`. Workstreams (and projects) with identical
// `.loop/` share one image, an unchanged fragment costs only an `image exists`
// check, and editing it yields a new tag on the next session start. The agent
// CLIs come from the loop-agents volume (agent-toolchain.js), so updating them
// never invalidates these images.
//
// The build runs inside the terminal session itself (see sandboxCommand), so its
// output streams to the agent/shell tab the user is already looking at.
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  existsSync, readFileSync, readdirSync, lstatSync, readlinkSync, mkdirSync, writeFileSync,
} from 'fs';
import { join } from 'path';

const execFileAsync = promisify(execFile);

export const BASE_IMAGE = 'claude-inner';
const IMAGE_REPO = 'loop-sandbox';
const CONTEXT_DIR = '.loop';
const FRAGMENT = `${CONTEXT_DIR}/sandbox.Dockerfile`;
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
function hashTree(hash, dir, rel = '') {
  for (const name of readdirSync(join(dir, rel)).sort()) {
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

// The image a repo's sandbox should run on, without building anything:
//   { tag, fragment }  — the repo has a fragment; tag is its content address
//   { error }          — it has one Loop can't use
//   null               — it has none; use the base image
async function resolveSandbox(repoPath) {
  const fragmentPath = join(repoPath, FRAGMENT);
  if (!existsSync(fragmentPath)) return null;
  const fragment = readFileSync(fragmentPath, 'utf8');
  // A FROM would start a new stage and drop the base image (and with it the
  // /opt/loop links the agent CLIs are reached through).
  if (/^\s*FROM\s/im.test(fragment)) {
    return { error: `${FRAGMENT} must not contain FROM — it is layered on Loop's base sandbox image.` };
  }
  const hash = createHash('sha256');
  hash.update(`${await getBaseImageId()}\0`);
  hashTree(hash, join(repoPath, CONTEXT_DIR));
  return { tag: `${IMAGE_REPO}:${hash.digest('hex').slice(0, 16)}`, fragment };
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
    resolved = { error: `Could not read ${CONTEXT_DIR}/: ${err.message}` };
  }
  if (!resolved) return { image: BASE_IMAGE };
  if (resolved.error) return { image: BASE_IMAGE, warning: `${resolved.error} Starting on the base image.` };
  if (await imageExists(resolved.tag)) return { image: resolved.tag };

  mkdirSync(BUILD_DIR, { recursive: true });
  const dockerfile = join(BUILD_DIR, `${resolved.tag.split(':')[1]}.Dockerfile`);
  writeFileSync(dockerfile, `FROM ${BASE_IMAGE}\n\n${resolved.fragment}\n`);
  return {
    image: resolved.tag,
    build: { tag: resolved.tag, dockerfile, context: join(repoPath, CONTEXT_DIR) },
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
    printf '\\033[36mBuilding sandbox image from ${FRAGMENT}...\\033[0m\\n'
    if podman build --pull=never --label loop.sandbox=1 -t "$tag" -f "$dockerfile" "$context"; then
      img=$tag
    else
      printf '\\033[31mSandbox image build failed - starting on the base image. Fix ${FRAGMENT}, then restart the sandbox.\\033[0m\\n'
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
