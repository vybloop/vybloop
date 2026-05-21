#!/bin/bash
set -e

podman system migrate

if ! podman image exists claude-inner 2>/dev/null; then
  echo "[start] Building claude-inner image..."
  podman build -t claude-inner /app/inner-container/
  echo "[start] claude-inner image ready."
fi

exec node /app/src/server.js
