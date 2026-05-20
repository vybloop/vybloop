# Podman Web

A Node.js web interface for running containers via nested rootless Podman.

## Build

```bash
./build.sh
```

This builds `podman-base` (rootless Podman on Ubuntu 24.04) then `podman-web` (Node.js server on top).

## Run

```bash
docker compose -f podman-web/docker-compose.yml up
```

Then open http://localhost:9876.

## Iterating on podman-web

Once the base image is built, you can rebuild and restart just the web layer without re-running `build.sh`:

```bash
docker compose -f podman-web/docker-compose.yml up --build
```

Only re-run `build.sh` if you change something in the `podman/` base image.
