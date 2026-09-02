// Images shared by an inner `claude-inner` agent into the web UI.
//
// The agent has no network access to the backend, but `/claudeconfig` is mounted
// into both the outer container and every inner container (see ipc-server.js), so
// it doubles as the drop box: the share tool copies the image under
// `/claudeconfig/shared-images/<projectId>/` and pings the IPC socket. The
// backend owns the metadata index so the tool script can stay dumb.
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync,
} from 'fs';
import { join, basename, extname } from 'path';

const ROOT = '/claudeconfig/shared-images';
const TOOL_PATH = '/claudeconfig/loop-share-image.sh';
const MAX_PER_PROJECT = 50;

// The tool the inner agent runs. Written next to the Stop hook at startup so a
// sandbox image rebuild is not needed to pick up changes to it.
export function installShareTool() {
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(TOOL_PATH, `#!/bin/sh
# Share an image with the Loop web UI: loop-share-image <file> [caption...]
set -e
src="$1"
if [ -z "$src" ]; then echo "usage: loop-share-image <image-file> [caption...]" >&2; exit 2; fi
if [ ! -f "$src" ]; then echo "loop-share-image: no such file: $src" >&2; exit 1; fi
shift
caption="$*"
dir="${ROOT}/\${LOOP_PROJECT_ID}"
mkdir -p "$dir"
name="\$(basename "$src")"
ext="\${name##*.}"
case "$ext" in
  png|PNG|jpg|JPG|jpeg|JPEG|gif|GIF|webp|WEBP|svg|SVG|bmp|BMP|ico|ICO|avif|AVIF) ;;
  *) echo "loop-share-image: unsupported image type: .$ext" >&2; exit 1 ;;
esac
file="\$(date +%s%N).\$ext"
cp "$src" "$dir/$file"
SHARE_FILE="$file" SHARE_NAME="$name" SHARE_CAPTION="$caption" node -e "
const net = require('net');
const msg = {
  event: 'image-shared',
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

// A file name is only ever a bare `<timestamp>.<ext>` we generated; reject
// anything that could escape the project's directory.
function safeFile(file) {
  if (typeof file !== 'string' || !file || file !== basename(file)) return null;
  if (file === 'index.json') return null;
  return file;
}

// Record an image the share tool just dropped. Returns the new entry, or null if
// the message was malformed or the file never landed.
export function recordSharedImage({ projectId, file, name, caption }) {
  const safe = safeFile(file);
  if (!projectId || !safe) return null;
  const full = join(projectDir(projectId), safe);
  if (!existsSync(full)) return null;

  const entry = {
    file: safe,
    name: name ? basename(name) : safe,
    caption: typeof caption === 'string' ? caption.slice(0, 500) : '',
    size: statSync(full).size,
    createdAt: new Date().toISOString(),
  };

  const entries = [entry, ...readIndex(projectId).filter(e => e.file !== safe)];
  // Keep the list bounded; drop the oldest images off the end.
  for (const stale of entries.splice(MAX_PER_PROJECT)) {
    try { rmSync(join(projectDir(projectId), stale.file), { force: true }); } catch {}
  }
  writeIndex(projectId, entries);
  return entry;
}

// Newest first.
export function listSharedImages(projectId) {
  return readIndex(projectId).filter(e => existsSync(join(projectDir(projectId), e.file)));
}

export function getSharedImagePath(projectId, file) {
  const safe = safeFile(file);
  if (!safe) return null;
  const full = join(projectDir(projectId), safe);
  return existsSync(full) ? full : null;
}

export function deleteSharedImage(projectId, file) {
  const safe = safeFile(file);
  if (!safe) return false;
  try { rmSync(join(projectDir(projectId), safe), { force: true }); } catch {}
  writeIndex(projectId, readIndex(projectId).filter(e => e.file !== safe));
  return true;
}

export function clearSharedImages(projectId) {
  try { rmSync(projectDir(projectId), { recursive: true, force: true }); } catch {}
}

export const SHARED_IMAGE_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif',
};

export function sharedImageMime(file) {
  return SHARED_IMAGE_MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
}
