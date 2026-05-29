# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

The app needs the `podman-base` image to be built first (in the `podman` directory). After that it can be run with docker compose. In most cases there should be no need to run the app while doing UI changes.

## Architecture

A project management UI ("Loop") for running Claude Code agents against multiple projects. Two components:

- **`backend/`** — Express + WebSocket server (Node.js, port 9876)
- **`frontend/`** — Vite + Lit web app

### Data file — `data/projects.json`

Single JSON file backing the project list. Edited directly by `backend/src/data.js` on every mutating API call.

```jsonc
{
  "nextId": 100,
  "config": { "terminalMode": "direct" },   // "direct" | "tmux"
  "projects": [
    {
      "id": "quill",                          // URL-safe slug, unique
      "name": "quill",
      "repo": "github.com/...",
      "description": "...",
      "branch": "main",
      "template": "vite-react",
      "lastActivity": "2026-05-20T13:58:00Z" // ISO 8601 UTC
    }
  ]
}
```

`status` and `changes` are runtime-only; not persisted. Project repos are stored at `/data/<id>/git`.

`hasCompose` is a runtime-only boolean included in project responses — `true` when a `docker-compose.yml` / `compose.yml` (or `.yaml` variants) exists in the repo root.

### API reference — `backend/src/server.js`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List all projects (includes runtime `status`, `changes`). |
| `POST` | `/api/projects` | Create a project. Body: `{ name*, repo, branch, template }`. Returns 201. |
| `GET` | `/api/projects/:id` | Get a single project. |
| `GET` | `/api/projects/:id/changes` | List pending file changes. |
| `POST` | `/api/projects/:id/commit` | Commit staged changes. Body: `{ message }`. |
| `POST` | `/api/projects/:id/run` | Start or stop the project's compose stack. Requires `docker-compose.yml` in the repo root. Returns `{ status }`. |
| `POST` | `/api/projects/:id/changes/stage-all` | Stage all changed files. |
| `POST` | `/api/projects/:id/changes/:fileId/toggle` | Toggle staged/unstaged for a file. |
| `GET` | `/api/templates` | List available project templates. |
| `GET` | `/api/config` | Get config (e.g. `terminalMode`). |
| `PATCH` | `/api/config` | Update config. |

WebSocket endpoint: `ws://host/api/projects/:id/ws/:type` where `type` is `agent` or `shell`.

### Terminal system

The project detail page embeds xterm.js terminals. Each terminal connects over WebSocket to the backend, which manages persistent terminal sessions per project.

**Frontend** (`frontend/src/loop-project-screen.js`): Opens an xterm.js terminal, connects to the WebSocket endpoint for the project, uses `FitAddon` + `ResizeObserver` to track size, and sends `{type:"input", data}` / `{type:"resize", cols, rows}` JSON messages. Receives raw PTY output as binary buffers.

**Backend** (`backend/src/terminal-session.js`): Two session implementations, selected by `config.terminalMode`:

- **`DirectSession`** (default) — spawns the command directly in a node-pty PTY. The process persists across WebSocket disconnects; multiple clients share the same PTY output stream.
- **`TerminalSession`** (tmux mode) — runs the command inside a named tmux session. Each WebSocket client gets its own grouped tmux session (isolated resize), allowing independent scrollback per client.

**What runs in the terminal**: The `agent` session type runs a Claude Code instance inside a `claude-inner` Podman container:
```
podman run --rm -it \
  -v <repoPath>:/project \
  -v /claudeconfig:/claudeconfig \
  --env CLAUDE_CONFIG_DIR=/claudeconfig \
  --env ANTHROPIC_API_KEY \
  --env IS_SANDBOX=1 \
  --env COLORTERM=truecolor \
  --env LOOP_PROJECT_ID=<projectId> \
  -w /project \
  claude-inner claude --dangerously-skip-permissions
```

The `shell` session type runs `bash` in the same container (without the claudeconfig mount).

Sessions are keyed by `projectId:type` and reused across reconnects while alive.

### Inner-to-outer IPC — `backend/src/ipc-server.js`

A Unix domain socket at `/claudeconfig/loop-events.sock` lets inner containers notify the backend. `/claudeconfig` is mounted into both the outer container and every `claude-inner` agent container, making it the natural shared path.

**Backend** (`backend/src/ipc-server.js`): On startup, creates the socket and installs a Claude Code `Stop` hook by writing a notify script to `/claudeconfig/loop-notify-done.sh` and merging a `hooks.Stop` entry into `/claudeconfig/settings.json`. The socket accepts newline-delimited JSON messages `{ event, projectId }` and calls a handler in `server.js`.

**Hook script**: Connects to the socket via Node.js and sends `{ event: "agent-done", projectId: "$LOOP_PROJECT_ID" }`. `LOOP_PROJECT_ID` is injected as an env var when the agent container is started.

**Adding new events**: Send a new `event` value from the hook (or any process with access to `/claudeconfig/`), handle it in the `startIpcServer` callback in `server.js`, and broadcast via the SSE helpers in `file-watcher.js`.

**SSE propagation**: `broadcastAgentDone(projectId)` in `file-watcher.js` sends an `agent-done` SSE event to all connected frontend clients for that project. The frontend listens in `_connectSse()` in `loop-project-screen.js`.

### Project run/stop (compose)

When a project's repo contains a `docker-compose.yml` (or `compose.yml`), the UI shows a **Run** button in the sidebar. Clicking it calls `POST /api/projects/:id/run`.

**Backend** (`backend/src/server.js`): The endpoint responds immediately with the new status, then runs the compose command in the background via `execFile` with `cwd` set to the repo path:
- **Start**: `podman compose up --build -d` → sets status to `running`
- **Stop**: `podman compose down` → sets status to `idle`

If the background command fails, status is set to `error` and a `status` SSE event is pushed to connected clients via `broadcastStatus` (`backend/src/file-watcher.js`).

On server startup, `restoreComposeStates()` runs `podman compose ps -q` for each project that has a compose file and restores `running` status for any that have containers already up.

**Frontend** (`frontend/src/loop-project-screen.js`): The Run/Stop button is only rendered when `project.hasCompose` is true. The `status` SSE event (in addition to the fetch response) keeps `_running` in sync if compose fails after the optimistic update.

**Compose provider**: `podman-compose` is installed in the app container (`Dockerfile`). Short image names (e.g. `golang:1.23-alpine`) resolve via `docker.io` thanks to `/etc/containers/registries.conf` set in the `podman-base` image (`podman/Dockerfile`).
