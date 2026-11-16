#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Builds podman-base (podman/) and then the app image on top of it.
echo "==> Building images..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" build

echo ""
echo "Done. To start the server:"
echo "  docker compose up"
echo ""
echo "Then open http://localhost:9876"
