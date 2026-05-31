#!/bin/bash
set -e

podman system migrate

# Fix any lock ID mismatches from a previous unclean shutdown (zombie processes
# that died holding SHM lock slots cause double-allocation on next run).
podman system renumber 2>/dev/null || true

# Clean up stale container state. If this fails (e.g. due to a lock mismatch that
# renumber couldn't fix because a DB layer flag is still set), do a full system
# reset as fallback — this clears all container/pod/network state while keeping
# images intact.
if ! podman rm --all --force 2>/dev/null; then
  echo "[start] Stale container state could not be cleaned up, performing system reset..."
  podman system reset --force 2>/dev/null || true
fi
podman pod rm --all --force 2>/dev/null || true

DOCKERFILE_HASH=$(sha256sum /app/inner-container/Dockerfile | cut -d' ' -f1)
EXISTING_HASH=$(podman image inspect claude-inner --format '{{index .Labels "dockerfile-hash"}}' 2>/dev/null || true)

if [ "$EXISTING_HASH" != "$DOCKERFILE_HASH" ]; then
  echo "[start] Building claude-inner image (Dockerfile changed)..."
  podman build -t claude-inner --label "dockerfile-hash=${DOCKERFILE_HASH}" /app/inner-container/
  echo "[start] claude-inner image ready."
fi

exec /usr/bin/catatonit -- node /app/src/server.js
