#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Building podman-base image..."
docker build -t podman-base "$SCRIPT_DIR/podman"

echo "==> Building podman-web image..."
docker build -t podman-web "$SCRIPT_DIR/podman-web"

echo ""
echo "Done. To start the server:"
echo "  docker compose -f podman-web/docker-compose.yml up"
echo ""
echo "Then open http://localhost:9876"
