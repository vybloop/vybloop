#!/bin/bash
set -e

podman system migrate

# Clean up stale container state left over from a previous run. Without this,
# Podman emits lock-file errors when refreshing containers it knew about before restart.
podman rm --all --force 2>/dev/null || true

if ! podman image exists claude-inner 2>/dev/null; then
  echo "[start] Building claude-inner image..."
  podman build -t claude-inner /app/inner-container/
  echo "[start] claude-inner image ready."
fi

exec node /app/src/server.js
