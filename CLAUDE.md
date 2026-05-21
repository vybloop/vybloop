# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
# Full build (required on first run or after changing podman/)
./build.sh

# Start the web server
docker compose -f podman-web/docker-compose.yml up

# Rebuild and restart only the web layer (faster iteration — skips podman-base)
docker compose -f podman-web/docker-compose.yml up --build
```

Access the UI at http://localhost:9876.

Only re-run `build.sh` when changing files under `podman/`. Everything else is part of the `podman-web` layer.

## Architecture

The project is two nested container images:

### `podman/` → `podman-base` image
Ubuntu 24.04 with rootless Podman configured for a nested container environment. Key constraints:
- Runs as `poduser` (UID 1000) via `entrypoint.sh`, which briefly runs as root to fix `/dev/fuse` permissions and tmpfs ownership before dropping privileges with `gosu`.
- Uses `fuse-overlayfs` (not kernel overlay) because kernel overlay is unavailable inside Docker.
- Requires `privileged: true` in docker-compose so user namespaces can be created inside the container.
- Container image storage is on a `tmpfs` mount — ephemeral, RAM-based, avoids root-ownership issues.

### `podman-web/` → `podman-web` image (multi-stage build)
Built on top of `podman-base`. The Dockerfile has two stages:

**Stage 1 (`frontend-builder`)** — `node:20-alpine` builds the Vite frontend from `podman-web/frontend/` into a static `dist/`.

**Stage 2** — Installs Node.js on `podman-base`, runs `npm install` for the Express server (which compiles `node-pty`'s native addon, requiring `python3` and `build-essential`), copies server code, then overlays the Vite `dist/` output into `public/`.

### Backend (`podman-web/server/`)
Express server on port 3000. Two capabilities:
1. **HTTP POST `/api/run`** — runs a shell command via `child_process.exec()` and returns combined stdout/stderr + exit code as JSON.
2. **WebSocket `/terminal`** — on upgrade, spawns the inner container via `node-pty` (PTY), bridges the PTY to the WebSocket. Client sends `{type:"input", data}` or `{type:"resize", cols, rows}` as JSON; server sends raw PTY output as binary buffers.

**Inner container launch** (`podman-web/server/server.js`, `wss.on('connection')`) — runs `podman run --rm -it claude-inner claude --dangerously-skip-permissions` with these mounts and env vars:
- `/project` → `/project` (bind mount), working dir set to `/project`
- `/home/poduser/claudeconfig` → `/claudeconfig`, `CLAUDE_CONFIG_DIR=/claudeconfig`
- `ANTHROPIC_API_KEY` (passed through from host), `IS_SANDBOX=1`, `COLORTERM=truecolor`

The HTTP server is created explicitly (`http.createServer(app)`) so the WebSocket server can share the same port via the `upgrade` event.

### Frontend (`podman-web/frontend/`)
Vite project. `src/main.js` opens an xterm.js terminal, connects to `ws://host/terminal`, uses `FitAddon` + `ResizeObserver` to keep the terminal sized to its container, and sends resize events to the backend.

The built output lands in `podman-web/frontend/dist/` and is copied to `server/public/` inside the Docker image. The `server/public/index.html` file is a legacy artifact that gets overwritten by the Vite build in Docker.

## Loop App (backend/ + frontend/)

A separate project management UI lives in `backend/` (Express) and `frontend/` (Vite + Lit). Run it with:

```bash
cd backend && npm install && node src/server.js
# In another terminal:
cd frontend && npm install && npm run dev
```

### Data file — `data/projects.json`

Single JSON file that backs the project list. Edited directly by `backend/src/data.js` on every mutating API call.

```jsonc
{
  "nextId": 100,          // auto-increment counter for new project IDs
  "projects": [
    {
      "id": "quill",            // URL-safe slug, unique
      "name": "quill",          // display name
      "repo": "github.com/...", // repository URL (free-form string)
      "description": "...",     // short description
      "status": "idle",         // "idle" | "running" | "error"
      "branch": "main",         // current git branch
      "template": "vite-react", // template ID (see TEMPLATES in data.js)
      "lastActivity": "2026-05-20T13:58:00Z" // ISO 8601 UTC, updated on mutations; frontend formats as relative time
    }
  ]
}
```

`changes` (file count) is runtime-only and not stored in the JSON. New projects created via the API get an ID of `<slugified-name>-<nextId>`.

### API reference — `backend/src/server.js` (port 3000)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List all projects. Each object includes a `changes` count. |
| `POST` | `/api/projects` | Create a project. Body: `{ name*, repo, branch, template }`. Returns 201 + new project. |
| `GET` | `/api/projects/:id` | Get a single project by ID. |
| `GET` | `/api/projects/:id/changes` | List pending file changes for a project. |
| `POST` | `/api/projects/:id/commit` | Commit staged changes. Body: `{ message, paths: string[] }`. |
| `POST` | `/api/projects/:id/run` | Toggle `status` between `running` and `idle`. |
| `POST` | `/api/projects/:id/changes/:fileId/toggle` | Toggle staged/unstaged for a file. |
| `GET` | `/api/templates` | List available project templates. |

All endpoints return JSON. Errors return `{ "error": "..." }` with an appropriate HTTP status code.
