// Files shared by an inner `claude-inner` agent into the web UI — screenshots,
// build artifacts, whole app bundles (a directory is archived on the way in).
//
// The agent has no network access to the backend, but `/claudeconfig` is mounted
// into both the outer container and every inner container (see ipc-server.js), so
// it doubles as the drop box: the share tool copies the file under
// `/claudeconfig/shared-files/<projectId>/` and pings the IPC socket. The
// backend owns the metadata index so the tool script can stay dumb.
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync, renameSync,
} from 'fs';
import { join, basename, extname } from 'path';

const ROOT = '/claudeconfig/shared-files';
// Where the store lived when it only held images; moved over on startup.
const LEGACY_ROOT = '/claudeconfig/shared-images';
const TOOL_PATH = '/claudeconfig/loop-share.sh';
// The old image-only tool name. Running agents were told about it in their
// system prompt, so it stays as an alias until they respawn.
const LEGACY_TOOL_PATH = '/claudeconfig/loop-share-image.sh';
const MAX_PER_PROJECT = 50;
// Artifacts can be big; past this many bytes per project the oldest entries are
// dropped. The newest entry is always kept, however large.
const MAX_BYTES_PER_PROJECT = 2 * 1024 ** 3;

// The tool the inner agent runs. Written next to the Stop hook at startup so a
// sandbox image rebuild is not needed to pick up changes to it.
export function installShareTool() {
  if (existsSync(LEGACY_ROOT) && !existsSync(ROOT)) {
    try { renameSync(LEGACY_ROOT, ROOT); } catch {}
  }
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(TOOL_PATH, `#!/bin/sh
# Share a file or directory with the Loop web UI: loop-share <path> [caption...]
# A directory is archived (zip, or tar.gz when zip is missing) before sharing.
set -e
src="$1"
if [ -z "$src" ]; then echo "usage: loop-share <file-or-directory> [caption...]" >&2; exit 2; fi
if [ ! -e "$src" ]; then echo "loop-share: no such file or directory: $src" >&2; exit 1; fi
shift
caption="$*"
dir="${ROOT}/\${LOOP_PROJECT_ID}"
mkdir -p "$dir"
stamp="\$(date +%s%N)"
if [ -d "$src" ]; then
  src="\$(cd "$src" && pwd)"
  parent="\$(dirname "$src")"
  base="\$(basename "$src")"
  if command -v zip >/dev/null 2>&1; then
    name="$base.zip"
    file="$stamp.zip"
    (cd "$parent" && zip -qry - "$base") > "$dir/$file"
  else
    name="$base.tar.gz"
    file="$stamp.tar.gz"
    tar -czf "$dir/$file" -C "$parent" "$base"
  fi
else
  name="\$(basename "$src")"
  case "$name" in
    *.*) ext="\$(printf %s "\${name##*.}" | tr -cd 'A-Za-z0-9' | cut -c1-16)" ;;
    *) ext="" ;;
  esac
  file="$stamp\${ext:+.$ext}"
  cp "$src" "$dir/$file"
fi
SHARE_FILE="$file" SHARE_NAME="$name" SHARE_CAPTION="$caption" node -e "
const net = require('net');
const msg = {
  event: 'file-shared',
  projectId: process.env.LOOP_PROJECT_ID || '',
  file: process.env.SHARE_FILE,
  name: process.env.SHARE_NAME,
  caption: process.env.SHARE_CAPTION || '',
};
const client = net.createConnection('/claudeconfig/loop-events.sock', function () {
  client.write(JSON.stringify(msg) + '\\n');
  client.end();
});
client.on('error', function () {});
"
echo "Shared \$name with the Loop UI."
`, { mode: 0o755 });
  writeFileSync(LEGACY_TOOL_PATH, `#!/bin/sh
exec sh ${TOOL_PATH} "$@"
`, { mode: 0o755 });
}

function projectDir(projectId) {
  return join(ROOT, projectId);
}

function indexPath(projectId) {
  return join(projectDir(projectId), 'index.json');
}

function readIndex(projectId) {
  try {
    const entries = JSON.parse(readFileSync(indexPath(projectId), 'utf8'));
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function writeIndex(projectId, entries) {
  mkdirSync(projectDir(projectId), { recursive: true });
  writeFileSync(indexPath(projectId), JSON.stringify(entries, null, 2));
}

// A file name is only ever a bare `<timestamp>[.<ext>]` we generated; reject
// anything that could escape the project's directory.
function safeFile(file) {
  if (typeof file !== 'string' || !file || file !== basename(file)) return null;
  if (file === 'index.json' || file === '.' || file === '..') return null;
  return file;
}

const IMAGE_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif',
};

export function isImageFile(file) {
  return extname(file).toLowerCase() in IMAGE_MIME;
}

// Entries recorded before non-image files existed carry no `kind`.
function withKind(entry) {
  return entry.kind ? entry : { ...entry, kind: isImageFile(entry.file) ? 'image' : 'file' };
}

// Record a file the share tool just dropped. Returns the new entry, or null if
// the message was malformed or the file never landed.
export function recordSharedFile({ projectId, file, name, caption }) {
  const safe = safeFile(file);
  if (!projectId || !safe) return null;
  const full = join(projectDir(projectId), safe);
  if (!existsSync(full)) return null;

  const entry = {
    file: safe,
    name: name ? basename(name) : safe,
    kind: isImageFile(safe) ? 'image' : 'file',
    caption: typeof caption === 'string' ? caption.slice(0, 500) : '',
    size: statSync(full).size,
    createdAt: new Date().toISOString(),
  };

  const entries = [entry, ...readIndex(projectId).filter(e => e.file !== safe)];
  // Keep the list bounded by count and total size; drop the oldest off the end.
  let keep = Math.min(entries.length, MAX_PER_PROJECT);
  let bytes = 0;
  for (let i = 0; i < keep; i++) {
    bytes += entries[i].size || 0;
    if (i > 0 && bytes > MAX_BYTES_PER_PROJECT) { keep = i; break; }
  }
  for (const stale of entries.splice(keep)) {
    try { rmSync(join(projectDir(projectId), stale.file), { force: true }); } catch {}
  }
  writeIndex(projectId, entries);
  return entry;
}

// Newest first.
export function listSharedFiles(projectId) {
  return readIndex(projectId)
    .filter(e => existsSync(join(projectDir(projectId), e.file)))
    .map(withKind);
}

// The on-disk path plus the name the agent shared it under (for downloads).
export function getSharedFile(projectId, file) {
  const safe = safeFile(file);
  if (!safe) return null;
  const full = join(projectDir(projectId), safe);
  if (!existsSync(full)) return null;
  const entry = readIndex(projectId).find(e => e.file === safe);
  return { path: full, name: entry?.name || safe };
}

export function deleteSharedFile(projectId, file) {
  const safe = safeFile(file);
  if (!safe) return false;
  try { rmSync(join(projectDir(projectId), safe), { force: true }); } catch {}
  writeIndex(projectId, readIndex(projectId).filter(e => e.file !== safe));
  return true;
}

export function clearSharedFiles(projectId) {
  try { rmSync(projectDir(projectId), { recursive: true, force: true }); } catch {}
}

export function sharedImageMime(file) {
  return IMAGE_MIME[extname(file).toLowerCase()] ?? null;
}
