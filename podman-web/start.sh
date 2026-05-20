#!/bin/bash
set -e

if ! podman image exists claude-inner 2>/dev/null; then
    echo "[start] Building claude-inner image (this may take a few minutes on first run)..."
    podman build -t claude-inner /app/inner-container/
    echo "[start] claude-inner image ready."
fi

exec node /app/server.js
