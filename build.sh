#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Building podman-base image..."
docker build -t podman-base "$SCRIPT_DIR/podman"

echo "==> Building main app image..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" build

echo ""
echo "Done. To start the server:"
echo "  docker compose up"
echo ""
echo "Then open http://localhost:9876"
