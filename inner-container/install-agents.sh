#!/bin/sh
# Installs Node and the agent CLIs (Claude Code, Codex) into the `loop-agents`
# volume, mounted here read-write at /opt/loop. Run by the backend
# (agent-toolchain.js) inside a throwaway `claude-inner` container, so the
# binaries match the sandbox's arch and libc.
#
# Agent containers mount the volume read-only and reach the CLIs through
# /opt/loop/bin. Keeping them out of the image means updating them never
# invalidates the image's layers, and bundling their own Node means nothing a
# project installs in its sandbox (a different nodejs, nvm, …) can break them.
#
# Layout:
#   versions/<id>/node/   Node.js distribution used only by the CLIs
#   versions/<id>/npm/    npm --prefix: lib/node_modules + npm's bin links
#   versions/<id>/bin/    wrappers that run each CLI on the bundled Node
#   versions/<id>/versions.json
#   current -> versions/<id>     swapped atomically once an install succeeds
#   bin -> current/bin
#
# The last line of stdout is versions.json.
set -eu

ROOT=/opt/loop
# Claude Code declares `engines.node >=22` from 2.1.198 on, and npm silently
# installs the newest release whose engines the running Node satisfies rather
# than failing — keep this at or above every CLI's engines.node.
NODE_MAJOR=24
ID=$(date -u +%Y%m%d%H%M%S)
V="$ROOT/versions/$ID"

mkdir -p "$V/node" "$V/npm" "$V/bin"
trap 'rm -rf "$V"' EXIT

case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

DIST="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
curl -fsSL "$DIST/SHASUMS256.txt" -o "$V/SHASUMS256.txt"
TARBALL=$(awk -v re="^node-v[0-9.]+-linux-$ARCH\\.tar\\.gz\$" '$2 ~ re { print $2 }' "$V/SHASUMS256.txt")
EXPECTED=$(awk -v f="$TARBALL" '$2 == f { print $1 }' "$V/SHASUMS256.txt")
[ -n "$TARBALL" ] || { echo "no linux-$ARCH tarball in $DIST" >&2; exit 1; }
echo "Downloading $TARBALL…"
curl -fsSL "$DIST/$TARBALL" -o "$V/node.tar.gz"
ACTUAL=$(sha256sum "$V/node.tar.gz" | cut -d' ' -f1)
[ "$ACTUAL" = "$EXPECTED" ] || { echo "checksum mismatch for $TARBALL" >&2; exit 1; }
tar -xzf "$V/node.tar.gz" -C "$V/node" --strip-components=1
rm "$V/node.tar.gz" "$V/SHASUMS256.txt"

# @latest is explicit so a stale metadata cache can't pin an old version.
# Claude Code's postinstall swaps its placeholder bin for the platform's native
# binary; newer npm skips install scripts that aren't explicitly allowed, which
# would leave `claude` as a non-working stub.
PATH="$V/node/bin:$PATH" npm install -g --prefix "$V/npm" --no-fund --no-audit \
  --allow-scripts=@anthropic-ai/claude-code \
  @anthropic-ai/claude-code@latest @openai/codex@latest

# npm's bin links run `#!/usr/bin/env node`, which would pick up whatever node
# is first on the sandbox's PATH. The wrappers pin the bundled one instead — or
# exec the target directly if a CLI ships a native binary rather than a script.
for cli in claude codex; do
  target=$(readlink -f "$V/npm/bin/$cli")
  if [ "$(head -c 2 "$target")" = '#!' ] && head -n 1 "$target" | grep -q node; then
    run="\"$V/node/bin/node\" \"$target\""
  else
    run="\"$target\""
  fi
  printf '#!/bin/sh\nexec %s "$@"\n' "$run" > "$V/bin/$cli"
  chmod +x "$V/bin/$cli"
done

# Running each CLI proves it works (e.g. that Codex's optional platform package
# with its prebuilt binary got installed) before anything is pointed at it.
version() { "$V/bin/$1" --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+[^ ]*' | head -n 1; }
CLAUDE_VERSION=$(version claude)
CODEX_VERSION=$(version codex)
"$V/node/bin/node" -e 'console.log(JSON.stringify({ id: process.argv[1], claude: process.argv[2], codex: process.argv[3], node: process.version }))' \
  "$ID" "$CLAUDE_VERSION" "$CODEX_VERSION" > "$V/versions.json"

trap - EXIT
ln -sfn "versions/$ID" "$ROOT/current.tmp"
mv -T "$ROOT/current.tmp" "$ROOT/current"
[ -L "$ROOT/bin" ] || ln -sfn current/bin "$ROOT/bin"

# Keep the new install and the one before it — the backend restarts every
# session after an update, so nothing should still be running anything older.
ls -1 "$ROOT/versions" | sort -r | tail -n +3 | while read -r old; do
  rm -rf "$ROOT/versions/$old"
done

cat "$V/versions.json"
