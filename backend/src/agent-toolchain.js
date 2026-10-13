// The agent CLIs (Claude Code, Codex) and the Node they run on live in a podman
// volume, not in the `claude-inner` image. Every agent/shell container mounts it
// read-only at /opt/loop, and the image symlinks /usr/local/bin/{claude,codex}
// into /opt/loop/bin.
//
// Updating the CLIs is then just an install into a new versions/<id> directory
// plus a symlink swap (inner-container/install-agents.sh) — no image rebuild, so
// layers stacked on top of the base image (installed tools) stay cached across
// CLI updates.
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const INSTALL_SCRIPT = join(__dirname, '../inner-container/install-agents.sh');

export const AGENTS_VOLUME = 'loop-agents';

// Mount for every sandbox container. Read-only: Claude Code's auto-updater must
// not rewrite a toolchain shared by every running sandbox (it is disabled via
// DISABLE_AUTOUPDATER too).
export const AGENTS_MOUNT = ['-v', `${AGENTS_VOLUME}:/opt/loop:ro`];

let installing = null;
let ensuring = null;

// Versions of the current install ({ id, claude, codex, node }), or null when
// nothing is installed yet. Read straight from the volume on this side.
export async function agentVersions() {
  try {
    const { stdout } = await execFileAsync('podman', [
      'volume', 'inspect', AGENTS_VOLUME, '--format', '{{.Mountpoint}}',
    ], { timeout: 30_000 });
    return JSON.parse(readFileSync(join(stdout.trim(), 'current/versions.json'), 'utf8'));
  } catch {
    return null;
  }
}

// Install the latest CLIs into the volume and make them current. Concurrent
// callers share one install. Resolves to the new versions.
export function updateAgents() {
  installing ??= (async () => {
    console.log('[agents] installing agent CLIs…');
    const { stdout } = await execFileAsync('podman', [
      'run', '--rm',
      '-v', `${AGENTS_VOLUME}:/opt/loop`,
      '-v', `${INSTALL_SCRIPT}:/install-agents.sh:ro`,
      'claude-inner', 'sh', '/install-agents.sh',
    ], { timeout: 900_000, maxBuffer: 20 * 1024 * 1024 });
    const versions = JSON.parse(stdout.trim().split('\n').pop());
    console.log(`[agents] installed Claude Code ${versions.claude}, Codex ${versions.codex}`);
    return versions;
  })().finally(() => { installing = null; });
  return installing;
}

// Install the CLIs if the volume has none (first start, or the volume was
// removed). Called at startup without awaiting; sessions wait on it below.
export function ensureAgents() {
  ensuring = (async () => {
    if (await agentVersions()) return;
    await updateAgents().catch(err => console.error('[agents] install failed:', err.stderr || err.message));
  })();
  return ensuring;
}

// Let the first-time install finish before a sandbox starts, so a session
// started right after boot doesn't find /opt/loop empty. An update doesn't need
// waiting for: the previous install stays current until it completes.
export async function agentsReady() {
  if (ensuring) await ensuring;
}
