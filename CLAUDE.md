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
  "config": { "terminalMode": "direct" },   // "direct" | "tmux"
  "projects": [
    {
      "id": "quill",                          // URL-safe slug derived from name, unique
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
| `POST` | `/api/sandbox/restart` | Tear down all live agent/shell sessions so they respawn with the current `claude-inner` image. |
| `POST` | `/api/sandbox/rebuild` | Rebuild the `claude-inner` image (mirrors `start.sh`), then restart sessions. |

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
  --env GIT_CONFIG_GLOBAL=/claudeconfig/gitconfig \
  --env ANTHROPIC_API_KEY \
  --env IS_SANDBOX=1 \
  --env COLORTERM=truecolor \
  --env LOOP_PROJECT_ID=<projectId> \
  -w /project \
  claude-inner claude --dangerously-skip-permissions
```

The `shell` session type runs `bash` in the same container. It also mounts `/claudeconfig` and sets `GIT_CONFIG_GLOBAL=/claudeconfig/gitconfig` so the git credential helper works there (see GitHub auth below).

Sessions are keyed by `projectId:type` and reused across reconnects while alive.

### Inner-to-outer IPC — `backend/src/ipc-server.js`

A Unix domain socket at `/claudeconfig/loop-events.sock` lets inner containers notify the backend. `/claudeconfig` is mounted into both the outer container and every `claude-inner` agent container, making it the natural shared path.

**Backend** (`backend/src/ipc-server.js`): On startup, creates the socket and installs a Claude Code `Stop` hook by writing a notify script to `/claudeconfig/loop-notify-done.sh` and merging a `hooks.Stop` entry into `/claudeconfig/settings.json`. The socket accepts newline-delimited JSON messages `{ event, projectId }` and calls a handler in `server.js`.

**Hook script**: Connects to the socket via Node.js and sends `{ event: "agent-done", projectId: "$LOOP_PROJECT_ID" }`. `LOOP_PROJECT_ID` is injected as an env var when the agent container is started.

**Adding new events**: Send a new `event` value from the hook (or any process with access to `/claudeconfig/`), handle it in the `startIpcServer` callback in `server.js`, and broadcast via the SSE helpers in `file-watcher.js`.

**SSE propagation**: `broadcastAgentDone(projectId)` in `file-watcher.js` sends an `agent-done` SSE event to all connected frontend clients for that project. The frontend listens in `_connectSse()` in `loop-project-screen.js`.

### GitHub authentication — `backend/src/git-auth.js` + `backend/src/git-credential-broker.js`

Two modes, chosen automatically:

- **GitHub App mode** ("VybLoop") — active when `GITHUB_APP_ID` is set and the private key is readable (`GITHUB_APP_PRIVATE_KEY_PATH`, default `/secrets/vybloop.pem`, mounted read-only via `docker-compose.yml`; the pem lives at the repo root, git-ignored). `git-auth.js` signs an RS256 JWT (built-in `crypto`, no dep), lists installations, and mints short-lived **installation access tokens** (cached, refreshed when <5 min remain). Users grant repo access by *installing the app on GitHub*, not by pasting a token.
- **PAT mode** (fallback) — when no App is configured, uses `GITHUB_TOKEN` (env) or the value set via the settings UI (persisted as `config.githubPat`).

**Credential delivery**: Because installation tokens expire (~1h), nothing is baked into the clone URL (the old PAT behaviour via `injectGithubToken` is gone — clones use clean URLs). Instead a **git credential helper** mints a fresh credential per git op. `git-credential-broker.js` writes the helper script `loop-git-credential.js` and a shared `gitconfig` (`credential.helper` + `credential.useHttpPath=true`) into `/claudeconfig`, and listens on `/claudeconfig/loop-git-credential.sock`. Both the backend process and the inner containers set `GIT_CONFIG_GLOBAL=/claudeconfig/gitconfig`, so backend pushes/fetches and in-container agent git all authenticate identically. The helper derives the repo owner from the request path and asks the broker, which returns `getCredentialForOwner(owner)`.

**Endpoints**: `GET /api/config/github` (status: mode, installations, install URL, PAT state) and `POST /api/config/github/pat` (set PAT). `GET /api/github/status` + `POST /api/github/repos` back the new-project "create a repo" flow (org repos via an installation with Administration access in App mode; `/user/repos` in PAT mode).

### Project run/stop (compose)

When a project's repo contains a `docker-compose.yml` (or `compose.yml`), the UI shows a **Run** button in the sidebar. Clicking it calls `POST /api/projects/:id/run`.

**Backend** (`backend/src/server.js`): The endpoint responds immediately with the new status, then runs the compose command in the background via `execFile` with `cwd` set to the repo path:
- **Start**: `podman compose up --build -d` → sets status to `running`
- **Stop**: `podman compose down` → sets status to `idle`

If the background command fails, status is set to `error` and a `status` SSE event is pushed to connected clients via `broadcastStatus` (`backend/src/file-watcher.js`).

On server startup, `restoreComposeStates()` runs `podman compose ps -q` for each project that has a compose file and restores `running` status for any that have containers already up.

**Frontend** (`frontend/src/loop-project-screen.js`): The Run/Stop button is only rendered when `project.hasCompose` is true. The `status` SSE event (in addition to the fetch response) keeps `_running` in sync if compose fails after the optimistic update.

**Compose provider**: `podman-compose` is installed in the app container (`Dockerfile`). Short image names (e.g. `golang:1.23-alpine`) resolve via `docker.io` thanks to `/etc/containers/registries.conf` set in the `podman-base` image (`podman/Dockerfile`).

**Exec into a running compose container**: Podman runs rootless and requires `XDG_RUNTIME_DIR` to be set. The `docker compose exec` command won't work; use `podman exec` directly:

```sh
# List running containers to find the container name
XDG_RUNTIME_DIR=/run/user/$(id -u) podman ps

# Exec a shell into a specific container (e.g. miner-4_game_1)
XDG_RUNTIME_DIR=/run/user/$(id -u) podman exec -it miner-4_game_1 sh

# Or via podman-compose (use the service name from docker-compose.yml, e.g. "game")
XDG_RUNTIME_DIR=/run/user/$(id -u) podman compose -p miner-4 exec game sh
```

**Podman lock ID mismatches ("deadlock due to lock mismatch")**: The `podman_storage` volume is persistent (it holds the libpod DB *and* images), but the runRoot (`/run/user/1000`) and the SHM lock segment (`/dev/shm/libpod_rootless_lock_*`) are ephemeral — wiped on every container restart. The DB still records each volume's lock slot, but the fresh SHM lock allocator starts empty, so newly created containers/pods get handed slots already claimed by persisted volumes → `deadlock due to lock mismatch`. `podman system renumber` (run at startup in `start.sh`) re-syncs all lock IDs to fix this. We use the **boltdb** libpod backend (`podman/containers.conf`) because the **sqlite** backend's renumber is broken whenever a volume exists (`updating volume config table … no such column: ID`, [containers/podman#23052](https://github.com/containers/podman/issues/23052)) — that bug is why the cleanup previously appeared to do nothing. `start.sh` auto-migrates an old sqlite `db.sql` to boltdb on startup (preserving images and volume data).

**Orphaned c/storage containers ("name is already in use by an external entity")**: The libpod DB and c/storage (the layer/container store) are separate. Dropping `db.sql` during the boltdb migration — and unclean shutdowns generally — leaves containers registered in c/storage but unknown to libpod. They keep squatting on their names, so compose fails to recreate e.g. `…_web_1` with *"the container name … is already in use by an external entity."* `podman rm --all` only enumerates libpod containers and never clears these. `start.sh` removes them by set difference: every ID in `podman ps -aq --external` that is **not** in `podman ps -aq` is an orphan, removed with `podman rm --storage --force` (the difference, rather than removing all external containers, protects any container libpod is actively running). To clear one by hand: `podman rm --storage <id>`.

**Why runRoot / SHM stay ephemeral (don't persist them)**: It's tempting to "fix" the mismatch above by mounting `runRoot` and `/dev/shm` on persistent volumes so they never desync from the DB. Don't — that trades a reconcilable problem for an unreconcilable one. The SHM segment holds futex lock state, not data: if a process dies holding a lock, a *fresh* segment on restart starts every lock released (the safety property you want after an unclean shutdown), whereas a *persisted* segment would carry an ownerless "locked" futex that no `renumber` can release — a true deadlock. `runRoot` likewise holds conmon sockets, PID files, exit files, and mount references tied to processes that no longer exist after a restart; it is designed to live on a tmpfs and be cleared on boot. The correct architecture is the one we have: **persistent `graphRoot` (images + DB) + ephemeral `runRoot`/SHM + `podman system renumber` on startup to reconcile.** The historical bug was not that locks were ephemeral — it was that the reconciliation step (`renumber`) was silently broken on the sqlite backend.

**Recovering a stuck compose project**: Restart the outer container. `start.sh` migrates the DB if needed, runs `podman system renumber`, and falls back to `podman system reset --force` only if renumber genuinely fails. If the volume itself is corrupt, wipe it:

```sh
docker compose down
docker volume rm claudeproj_podman_storage
docker compose up --build -d
```

This forces a rebuild of `claude-inner` and all project images on next use.
