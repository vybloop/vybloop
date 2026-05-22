# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

The app needs the `podman-base` image to be built first (in the `podman` directory). After that it can be run with docker compose. In most cases there should be no need to run the app while doing UI changes.

## Architecture

A project management UI ("Loop") for running Claude Code agents against multiple projects. Two components:

- **`backend/`** — Express + WebSocket server (Node.js, port 3000)
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

### API reference — `backend/src/server.js`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List all projects (includes runtime `status`, `changes`). |
| `POST` | `/api/projects` | Create a project. Body: `{ name*, repo, branch, template }`. Returns 201. |
| `GET` | `/api/projects/:id` | Get a single project. |
| `GET` | `/api/projects/:id/changes` | List pending file changes. |
| `POST` | `/api/projects/:id/commit` | Commit staged changes. Body: `{ message }`. |
| `POST` | `/api/projects/:id/run` | Toggle `status` between `running` and `idle`. |
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
  -w /project \
  claude-inner claude --dangerously-skip-permissions
```

The `shell` session type runs `bash` in the same container (without the claudeconfig mount).

Sessions are keyed by `projectId:type` and reused across reconnects while alive.
