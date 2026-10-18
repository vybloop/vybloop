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
  "config": {
    "terminalMode": "direct",               // "direct" | "tmux"
    "agentCli": "claude",                   // "claude" | "codex" — default CLI for projects with no override
    "portRange": "22000-23000",             // host ports Loop hands out
    "nextPort": 22015,                      // cursor for per-project allocation
    "timezone": "America/Los_Angeles"       // IANA zone; passed to sandboxes as TZ
  },
  "projects": [
    {
      "id": "quill",                          // URL-safe slug derived from name, unique
      "name": "quill",
      "repo": "github.com/...",
      "description": "...",
      "branch": "main",
      "template": "vite-react",
      "port": 22014,                          // stable HOST_PORT for this project
      "agentCli": "codex",                    // optional per-project override of config.agentCli
      "folderId": "work",                     // optional; home-screen folder (top-level projects only)
      "lastActivity": "2026-05-20T13:58:00Z" // ISO 8601 UTC
    }
  ],
  "folders": [
    { "id": "work", "name": "Work" }         // id slugified from name, de-duplicated with -2, -3…
  ]
}
```

`status` and `changes` are runtime-only; not persisted. Project repos are stored at `/data/<id>/git`.

Workstream rows live in the same `projects` array and additionally carry `parentId` and `workstream` (see "Workstreams" below).

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
| `GET` | `/api/projects/:id/deletion-impact` | Work that deleting this id would destroy: `{ commits, subjects, uncommittedFiles, hasRemote, branch }` (commits reachable from HEAD but from no remote-tracking ref). |
| `POST` | `/api/projects/:id/agent-cli` | Switch just this project/workstream's agent CLI. Body: `{ agentCli }`. Restarts only its agent session and sets the global default. |
| `GET` | `/api/projects/:id/workstreams` | List the project's workstreams (default first). |
| `POST` | `/api/projects/:id/workstreams` | Create a workstream. Body: `{ name }`. Returns 201 with `status: "cloning"`. |
| `DELETE` | `/api/projects/:id` | Delete a project or workstream (and, for a project, its workstreams). |
| `POST` | `/api/projects/:id/folder` | Move a top-level project into a folder. Body: `{ folderId }` (`null` = top level). |
| `GET` | `/api/folders` | List project folders. |
| `POST` | `/api/folders` | Create a folder. Body: `{ name }`. Returns 201. |
| `PATCH` | `/api/folders/:folderId` | Rename a folder. Body: `{ name }`. |
| `DELETE` | `/api/folders/:folderId` | Delete a folder; its projects move back to the top level (never deleted). |
| `GET` | `/api/templates` | List available project templates. |
| `GET` | `/api/config` | Get config (e.g. `terminalMode`). |
| `PATCH` | `/api/config` | Update config. |
| `GET` | `/api/projects/:id/shared-files` | Files the agent shared with the UI, newest first (`{ file, name, kind: "image"\|"file", caption, size, createdAt }`). |
| `GET` | `/api/projects/:id/shared-files/:file` | Serve one shared file. Images inline (attachment with `?download=1`); everything else always as an attachment named after the original file. |
| `DELETE` | `/api/projects/:id/shared-files/:file` | Remove one shared file. |
| `DELETE` | `/api/projects/:id/shared-files` | Remove all of a project's shared files. |
| `GET` | `/api/volumes` | List podman volumes: `{ name, createdAt, project, projectLabel, containers, inUse }` (`project` from the compose label; `projectLabel` is `null` when that project was deleted). |
| `DELETE` | `/api/volumes/:name` | Delete a volume (`podman volume rm -f`, which also removes stopped containers referencing it). 409 while a running container mounts it. |
| `POST` | `/api/sandbox/restart` | Tear down all live agent/shell sessions so they respawn with the current image (the top-bar menu's **Restart all sandboxes**, off a project page). |
| `GET` | `/api/projects/:id/sandbox` | The project's sandbox setup: `{ use, fragment, image, built, layers, warnings, error, configError, running, stale }` — `stale` when its running sandbox is on a different image than its setup now resolves to. |
| `PUT` | `/api/projects/:id/sandbox` | Set the library layers it uses. Body: `{ use: [layerId] }`. Writes `.loop/sandbox.json` in the repo. |
| `POST` | `/api/projects/:id/sandbox/promote` | Turn its `.loop/sandbox.Dockerfile` into a library layer. Body: `{ name, description, replace }`; `replace` switches the project to the new layer and removes its file. Returns 201 `{ layer, sandbox }`. |
| `GET` | `/api/sandbox-layers` | Library layers: `{ id, name, description, fragment, builtin, modified, usedBy: [{ id, label }] }`. |
| `POST` | `/api/sandbox-layers` | Create a layer. Body: `{ name*, description, fragment* }`; id slugified from the name. 409 if taken. |
| `PUT` | `/api/sandbox-layers/:layerId` | Edit a layer (a built-in gets a user override). |
| `DELETE` | `/api/sandbox-layers/:layerId` | Delete a user layer, or revert a modified built-in. |
| `POST` | `/api/projects/:id/sandbox/restart` | Tear down just this project/workstream's agent and shell sessions (**Restart this sandbox** on a project page) — rebuilding its sandbox image if `.loop/` changed. |
| `POST` | `/api/sandbox/update-agents` | Install the latest agent CLIs into the `loop-agents` volume, then restart sessions. Returns `{ versions: { id, claude, codex, node } }`. |

WebSocket endpoint: `ws://host/api/projects/:id/ws/:type` where `type` is `agent` or `shell`.

### Workstreams

A **workstream** is an isolated copy of a project's repo — its own working tree, its own git branch, its own agent/shell sandbox, its own compose stack — so several agents can work on different features in parallel. The original checkout is the "default" workstream. URLs: `/project/<projectId>` (default) and `/project/<projectId>/<workstream>`.

**A workstream is just a project row with a parent.** It is stored in the same `projects` array with

```
id       = `${parentId}--${workstream}`     e.g. "quill--feat-auth"
parentId = "quill"
workstream = "feat-auth"
```

`slugify()` collapses runs of `-`, so no plain project id can ever contain `--` and the composite is unambiguous. Because *everything* in the backend is keyed by a single opaque project id — repo path `/data/<id>/git`, `projectStatus`, terminal `sessions`, `watchers`, log buffers, the compose project name and `pod_<id>`, and `LOOP_PROJECT_ID` for the IPC hook — workstreams get full isolation for free and every `/api/projects/:id/*` route works on them unchanged. **Do not add a second "workstream id" parameter to these paths**; widen the id instead.

Creation (`createWorkstream` in `data.js`) requires an upstream (`project.repo`) and runs in the background:

```sh
git clone /data/<parentId>/git /data/<parentId>--<slug>/git   # local, fast, carries unpushed commits
git remote set-url origin <upstream>                          # push independently of the parent
git fetch origin
git checkout -b <slug> --no-track origin/<baseBranch>
```

`--no-track` is load-bearing: without it git sets the branch's upstream to `origin/<baseBranch>` and a later `git push` refuses because the names don't match. The branch stays unpublished until the first sync, where `syncProject` runs `git push -u origin HEAD` (`getRemoteStatus` reports `hasUpstream: false` and the UI shows **Publish** instead of **Sync**).

Deleting a project deletes its workstreams; `server.js` tears down each child's sessions/watchers/logs/containers first, because `destroyProjectSessions(parentId)`'s `startsWith(\`${id}:\`)` filter does not match child session keys.

Workstreams get their own host port automatically (see "Host ports" below), so several can run at once.

### Folders

A purely organisational, one-level grouping on the home screen (`loop-home-screen.js`). Nothing but the home screen knows about them. A top-level project joins a folder via its `folderId`; workstreams never carry one — they always follow their parent. A `folderId` pointing at a missing folder is treated as top level. Projects are filed by dragging a card/row onto a folder (or any project inside it), or via **Move to** in the project's `…` menu (the only way on touch devices). In both views folders and projects with workstreams expand/collapse; the collapsed set is a per-viewer convenience in `localStorage` (`loop.home.collapsed`), and a search expands everything.

### Terminal system

The project detail page embeds xterm.js terminals. Each terminal connects over WebSocket to the backend, which manages persistent terminal sessions per project.

**Frontend** (`frontend/src/loop-project-screen.js`): Opens an xterm.js terminal, connects to the WebSocket endpoint for the project, uses `FitAddon` + `ResizeObserver` to track size, and sends `{type:"input", data}` / `{type:"resize", cols, rows}` JSON messages. Receives raw PTY output as binary buffers.

**Backend** (`backend/src/terminal-session.js`): Two session implementations, selected by `config.terminalMode`:

- **`DirectSession`** (default) — spawns the command directly in a node-pty PTY. The process persists across WebSocket disconnects; multiple clients share the same PTY output stream.
- **`TerminalSession`** (tmux mode) — runs the command inside a named tmux session. Each WebSocket client gets its own grouped tmux session (isolated resize), allowing independent scrollback per client.

**What runs in the terminal**: The `agent` session type runs an agent CLI inside a `claude-inner` Podman container. Which CLI is the project's own `agentCli`, else `config.agentCli` (see "Agent CLI" below); with the default `"claude"`:
```
podman run --rm -it \
  -v <repoPath>:/project \
  -v /claudeconfig:/claudeconfig \
  --env CLAUDE_CONFIG_DIR=/claudeconfig \
  --env GIT_CONFIG_GLOBAL=/claudeconfig/gitconfig \
  --env ANTHROPIC_API_KEY \
  --env IS_SANDBOX=1 \
  --env COLORTERM=truecolor \
  --env TZ=<config.timezone> \
  --env LOOP_PROJECT_ID=<projectId> \
  -w /project \
  claude-inner claude --dangerously-skip-permissions
```

**Agent CLIs live on a volume, not in the image** — `backend/src/agent-toolchain.js` + `inner-container/install-agents.sh`. The `claude-inner` image is just Ubuntu + git/nano/zip/tzdata + Node (for projects and Loop's helper scripts) and symlinks `/usr/local/bin/{claude,codex}` → `/opt/loop/bin/`. Every agent and shell container mounts the podman volume `loop-agents` read-only at `/opt/loop` (`AGENTS_MOUNT`). Keeping the CLIs out of the image means updating them never invalidates image layers — the groundwork for per-project tool layers stacked on the base image.

- `install-agents.sh` runs in a throwaway `claude-inner` container with the volume mounted read-write. It downloads Node (`NODE_MAJOR`, sha256-checked) into `versions/<id>/node`, `npm install -g --prefix versions/<id>/npm` both CLIs at `@latest`, writes wrappers in `versions/<id>/bin` that run each CLI on that bundled Node (or exec it directly when it ships a native binary — Claude Code does), runs `--version` on each, writes `versions.json`, then atomically swaps `current -> versions/<id>` and deletes all but the two newest installs. A failed install removes its directory and leaves `current` alone.
- Bundled Node: npm's bin links use `#!/usr/bin/env node`, so a project installing a different Node in its sandbox could otherwise break the agent. Keep `NODE_MAJOR` at or above every CLI's `engines.node` — npm silently installs the newest release whose engines the running Node satisfies rather than failing (this once pinned the sandbox at Claude Code 2.1.197; 2.1.198+ needs Node ≥22).
- `--allow-scripts=@anthropic-ai/claude-code` is load-bearing: Claude Code's postinstall replaces a placeholder `bin/claude.exe` with the platform's native binary, and newer npm skips unlisted install scripts.
- Claude Code runs with `DISABLE_AUTOUPDATER=1`; the mount is read-only and shared by every sandbox.
- **Update agent CLIs** in the top-bar menu (`POST /api/sandbox/update-agents`) installs *first* and tears down sessions *after*: the frontend reconnects a terminal WebSocket the moment its session dies, so tearing down first would respawn sessions on the old install. For the same reason `DirectSession.destroy()` signals SIGTERM (then SIGKILL), not node-pty's default SIGHUP, which `podman run` ignores and which left orphan agent containers running.
- On startup `ensureAgents()` installs the CLIs in the background if the volume has none; `getOrCreateSession` awaits it (`agentsReady()`) so an early session doesn't find `/opt/loop` empty. The volume is hidden from, and can't be deleted via, the volumes UI.
- `start.sh` still rebuilds `claude-inner` only when its Dockerfile hash changes.

### Agent CLI — `backend/src/agent-cli.js`

The agent terminal runs either **Claude Code** or **Codex**, switched from the top-bar menu (next to Restart sandbox / Update agent CLIs). Both live on the `loop-agents` volume every sandbox mounts, so switching costs nothing but a session restart.

**The choice is per project row**, which means per workstream — two workstreams of the same project can run different CLIs at once. `getAgentCli(id)` in `data.js` returns the row's own `agentCli` if it has one, else `config.agentCli`; a row only gets one when the user picks a CLI while that project is open. `agentCommand()` resolves it at session start, so the CLI is baked into that container's argv for its lifetime.

- `POST /api/projects/:id/agent-cli { agentCli }` — the top-bar switch on a project page. Stamps `agentCli` on the row, makes it `config.agentCli` (the default for rows that never chose), and calls `destroyProjectSessions(id, 'agent')` so **only that** agent terminal restarts; every other sandbox keeps running the CLI it started with. The terminal reconnects on its own.
- `PATCH /api/config { agentCli }` — the same switch with no project in view (home / new-project screens). Changes the default only and restarts nothing, so a switch made elsewhere never yanks the CLI out from under a working agent.

Shell sessions are left alone either way; they run bash on both.

`agent-cli.js` owns everything that differs between them:

| | Claude Code | Codex |
|---|---|---|
| command | `claude --dangerously-skip-permissions` | `codex --dangerously-bypass-approvals-and-sandbox` (the container *is* the sandbox) |
| config dir | `CLAUDE_CONFIG_DIR=/claudeconfig` | `CODEX_HOME=/claudeconfig/codex` |
| credentials | `ANTHROPIC_API_KEY`, or `/claudeconfig` login | `OPENAI_API_KEY`, or a `codex login` persisted in `CODEX_HOME` |
| sandbox instructions | `--append-system-prompt` | `$CODEX_HOME/AGENTS.md` (Codex has no such flag) |
| turn-done notification | `hooks.Stop` in `settings.json` | `notify = [...]` in `$CODEX_HOME/config.toml` |

`AGENT_INSTRUCTIONS` is the single source for the sandbox rules (no nested containers, `${HOST_PORT}`, the share script); `installCodexConfig()` writes the Codex-side files at backend startup — like the share tool, so editing them needs only a backend restart, not a sandbox rebuild. Both notification paths run the same `/claudeconfig/loop-notify-done.sh`, so `agent-done` reaches the UI identically. Codex does not read `CLAUDE.md`, which is what the project templates write, so its `AGENTS.md` tells it to fall back to `CLAUDE.md`. `config.toml` is rewritten by replacing just the `notify` line, keeping any hand-added settings — and keeping the key ahead of any `[table]` header, since a bare TOML key after one belongs to that table.

The `shell` session type runs `bash` in the same container. It also mounts `/claudeconfig` and sets `GIT_CONFIG_GLOBAL=/claudeconfig/gitconfig` so the git credential helper works there (see GitHub auth below).

Sessions are keyed by `projectId:type` and reused across reconnects while alive.

### Per-project sandbox images — `backend/src/sandbox-image.js`

A repo extends its sandbox with **`.loop/sandbox.Dockerfile`**: a Dockerfile *fragment* (RUN/ENV/COPY…, no `FROM`) layered on `claude-inner`, built with `.loop/` as the context. It replaces agents keeping setup scripts and reinstalling tools every session. `AGENT_INSTRUCTIONS` tells both CLIs to put tools there.

- **Content-addressed**: the image is `loop-sandbox:<sha256(base image id + every file under .loop/)[:16]>`. Identical `.loop/` → one shared image across workstreams/projects; an unchanged fragment costs a `podman image exists`; an edit yields a new tag on the next session start (running sessions keep theirs until restarted — **Restart this sandbox**). Because the agent CLIs live on the `loop-agents` volume, updating them never invalidates these images.
- **The build runs in the terminal**: `getOrCreateSession` calls `prepareSandbox(repoPath)`; when the tag is missing, `sandboxCommand()` wraps the session's `podman run` argv (which carries `IMAGE_PLACEHOLDER` instead of an image name) in a `sh -c` script that runs `podman build` first, so its output streams into the agent/shell tab. `flock` on `/tmp/loop-sandbox/<hash>.Dockerfile.lock` makes the agent and shell tab (or two workstreams) share one build. A failed build — or a fragment containing `FROM`, which would drop the base image and the `/opt/loop` CLI links — falls back to `claude-inner` with a coloured warning, so the agent still starts and can fix it.
- The generated Dockerfile (`FROM claude-inner` + fragment) is written to `/tmp/loop-sandbox/`, outside the repo, so builds never dirty the working tree. `--pull=never` keeps `claude-inner` resolving to the local image.
- **Layer library** — `backend/src/sandbox-layers.js`. A project lists layer ids in **`.loop/sandbox.json`** (`{ "use": [...] }`). The generated Dockerfile is `FROM claude-inner`, then those layers **sorted by id** (a fixed order, so projects sharing layers share podman's cached prefix), then the repo's fragment. The tag hashes each layer's fragment instead of `sandbox.json` itself, so editing a library layer rebuilds every project using it on its next start. Built-in layers (C/C++, Python, Go, Rust, QEMU/OS dev, Blender) are defined in code; user layers are `/data/sandbox-layers/<id>.json`, and one whose id matches a built-in overrides it ("modified" — deleting it reverts). Library layers have no build context, so `layerFragmentError()` rejects `FROM`, `COPY` without `--from`, and `ADD` of anything but a URL. A layer a project lists but the library lacks is skipped with a warning in the terminal, not a failed build. **Promote** (`POST /api/projects/:id/sandbox/promote`) copies the repo's fragment into the library and, with `replace`, swaps the file for a `use` entry; the generated Dockerfile stays the same, so the rebuild is fully cached. `writeAgentIndex()` mirrors the library to `/claudeconfig/loop-sandbox-layers.json` (at startup and on every change), and `AGENT_INSTRUCTIONS` points the agents at it so they enable an existing layer instead of rewriting it.
- **UI**: **Sandbox tools…** in the top-bar menu (`loop-sandbox-dialog.js`) — on a project page, checkboxes for its layers, its own fragment with **Promote…**, warnings, and a **Restart this sandbox** prompt when `stale`; plus the library (view, edit, create, delete/revert). Each session records the image it started on (`session.sandboxImage`) for the `stale` check.
- **GC**: `pruneSandboxImages()` (startup, then daily) `podman rmi`s every `label=loop.sandbox=1` image no project's current `.loop/` resolves to. Without `-f` it can't remove an image a running sandbox uses; layers shared with a current image stay cached.

### Inner-to-outer IPC — `backend/src/ipc-server.js`

A Unix domain socket at `/claudeconfig/loop-events.sock` lets inner containers notify the backend. `/claudeconfig` is mounted into both the outer container and every `claude-inner` agent container, making it the natural shared path.

**Backend** (`backend/src/ipc-server.js`): On startup, creates the socket and installs a Claude Code `Stop` hook by writing a notify script to `/claudeconfig/loop-notify-done.sh` and merging a `hooks.Stop` entry into `/claudeconfig/settings.json`. The socket accepts newline-delimited JSON messages `{ event, projectId }` and calls a handler in `server.js`.

**Hook script**: Connects to the socket via Node.js and sends `{ event: "agent-done", projectId: "$LOOP_PROJECT_ID" }`. `LOOP_PROJECT_ID` is injected as an env var when the agent container is started.

**Adding new events**: Send a new `event` value from the hook (or any process with access to `/claudeconfig/`), handle it in the `startIpcServer` callback in `server.js`, and broadcast via the SSE helpers in `file-watcher.js`.

**Agent busy (title spinner)**: A second hook, `UserPromptSubmit` → `/claudeconfig/loop-notify-start.sh`, sends `agent-start`; `setAgentBusy()` in `file-watcher.js` tracks the busy flag and pushes an `agent-busy` SSE event (`{ busy }`, also sent in the `/events` snapshot), and the project screen shows a braille spinner in the tab title while it is set. `agent-done`, the agent session ending, and a sandbox restart clear it. Interrupting with Esc fires no hook, so agent PTY output is the backstop: 15s of silence while busy clears the flag (a working Claude Code redraws its spinner constantly). Codex has no prompt-submit hook, so it never shows the spinner.

**SSE propagation**: `broadcastAgentDone(projectId)` in `file-watcher.js` sends an `agent-done` SSE event to all connected frontend clients for that project. The frontend listens in `_connectSse()` in `loop-project-screen.js`.

### Shared files — `backend/src/shared-files.js`

The inner agent can push a file into the web UI — a screenshot to preview, or a deliverable to download (a built app, a binary, a PDF). It has no route to the backend's HTTP API, so this rides the same `/claudeconfig` mount as the IPC socket:

1. `installShareTool()` (called from `server.js` at startup, next to the Stop hook) writes `/claudeconfig/loop-share.sh`. The agent's instructions (`AGENT_INSTRUCTIONS` in `agent-cli.js`) tell it to run `sh /claudeconfig/loop-share.sh <file-or-directory> [caption]`. `loop-share-image.sh`, the old image-only name, is kept as an alias so agents started with the old prompt keep working.
2. The script copies the file to `/claudeconfig/shared-files/<projectId>/<timestamp>[.<ext>]` (ext sanitized to alphanumerics; the original name travels in the message). A **directory** is archived first — `zip -qry` (installed in `inner-container/Dockerfile`), falling back to `tar.gz` in a sandbox image built before that — so an agent can hand over e.g. a whole `dist/`. It then sends `{ event: "file-shared", projectId, file, name, caption }` over `loop-events.sock` (`image-shared` is still accepted).
3. `server.js` calls `recordSharedFile()`, which stamps `kind` (`image` by extension, else `file`), size and `createdAt` into `/claudeconfig/shared-files/<projectId>/index.json` (newest first, capped at 50 entries and 2 GiB — the oldest are deleted, the newest is always kept), then `broadcastSharedFile()` pushes a `shared-file` SSE event.
4. `loop-project-screen.js` prepends the entry to `_sharedFiles` and opens the right-hand **Shared files** panel. Images render as thumbnails (click → lightbox); other files as a download card with name and size. Every card has a download button. The panel is dismissable (its `×`); once dismissed a badge next to the connection chip reopens it, and the next shared file pops it open again.

Non-image files are only ever served as `Content-Disposition: attachment` with `application/octet-stream`, plus `Content-Security-Policy: sandbox` and `nosniff` on everything, so a shared `.html` (or `.svg`) can never execute on Loop's origin.

The script is written to `/claudeconfig` rather than baked into `inner-container/Dockerfile` so changes to it need only a backend restart, not a sandbox rebuild. Changing the *system prompt* wording still needs the agent session to respawn (**Restart sandbox**), since it is a `podman run` argument. The store used to live at `/claudeconfig/shared-images`; `installShareTool()` renames it on first start.

Because the store is keyed by the opaque project id, workstreams get their own file list for free. `teardownProject()` calls `clearSharedFiles(id)` so deleting a project or workstream drops its files.

### GitHub authentication — `backend/src/git-auth.js` + `backend/src/git-credential-broker.js`

Two modes, chosen automatically:

- **GitHub App mode** ("VybLoop") — active when `GITHUB_APP_ID` is set and the private key is readable (`GITHUB_APP_PRIVATE_KEY_PATH`, default `/secrets/vybloop.pem`, mounted read-only via `docker-compose.yml`; the pem lives at the repo root, git-ignored). `git-auth.js` signs an RS256 JWT (built-in `crypto`, no dep), lists installations, and mints short-lived **installation access tokens** (cached, refreshed when <5 min remain). Users grant repo access by *installing the app on GitHub*, not by pasting a token.
- **PAT mode** (fallback) — when no App is configured, uses `GITHUB_TOKEN` (env) or the value set via the settings UI (persisted as `config.githubPat`).

**Credential delivery**: Because installation tokens expire (~1h), nothing is baked into the clone URL (the old PAT behaviour via `injectGithubToken` is gone — clones use clean URLs). Instead a **git credential helper** mints a fresh credential per git op. `git-credential-broker.js` writes the helper script `loop-git-credential.js` and a shared `gitconfig` (`credential.helper` + `credential.useHttpPath=true`) into `/claudeconfig`, and listens on `/claudeconfig/loop-git-credential.sock`. Both the backend process and the inner containers set `GIT_CONFIG_GLOBAL=/claudeconfig/gitconfig`, so backend pushes/fetches and in-container agent git all authenticate identically. The same `gitconfig` also sets `core.editor=nano` (nano is installed in `inner-container/Dockerfile`, and the sessions export `EDITOR`/`VISUAL` too), so interactive git in the shell tab — `git commit` with no `-m`, `rebase -i` — opens an editor instead of failing. The helper derives the repo owner from the request path and asks the broker, which returns `getCredentialForOwner(owner)`.

**Endpoints**: `GET /api/config/github` (status: mode, installations, install URL, PAT state) and `POST /api/config/github/pat` (set PAT). `GET /api/github/status` + `POST /api/github/repos` back the new-project "create a repo" flow (org repos via an installation with Administration access in App mode; `/user/repos` in PAT mode).

### Project run/stop (compose)

When a project's repo contains a `docker-compose.yml` (or `compose.yml`), the UI shows a **Run** button in the sidebar. Clicking it calls `POST /api/projects/:id/run`.

**Backend** (`backend/src/server.js`): The endpoint responds immediately with the new status, then runs the compose command in the background via `execFile` with `cwd` set to the repo path:
- **Start**: `podman compose up --build -d` → sets status to `running`
- **Stop**: `podman compose down` → sets status to `idle`

If the background command fails, status is set to `error` and a `status` SSE event is pushed to connected clients via `broadcastStatus` (`backend/src/file-watcher.js`).

On server startup, `restoreComposeStates()` runs `podman compose ps -q` for each project that has a compose file and restores `running` status for any that have containers already up.

**Frontend** (`frontend/src/loop-project-screen.js`): The Run/Stop button is only rendered when `project.hasCompose` is true. The `status` SSE event (in addition to the fetch response) keeps `_running` in sync if compose fails after the optimistic update.

### Host ports — `HOST_PORT`

Project compose files must never hard-code a host port. They publish through `${HOST_PORT}` (e.g. `- "${HOST_PORT}:8080"`); Loop assigns the value and passes it in the environment of every `podman compose` invocation. The template CLAUDE.md files (`backend/src/templates.js`, shared footer) and the agent's `--append-system-prompt` both instruct Claude Code to write compose files this way.

Allocation lives in `backend/src/data.js`:

- **Default workstream** (a plain project row) — a stable port persisted as `project.port`, allocated from the **bottom** of `config.portRange` via `allocatePort()` (cursor `config.nextPort`, skipping ports already assigned). Assigned at `createProject`, and lazily by `getHostPort()` for rows predating the field or created before the port mattered.
- **Named workstream** — a dynamic port taken from the **top** of the range, held in the in-memory `workstreamPorts` map (deliberately *not* persisted; it only has to stay stable while the workstream is running, and it is re-derived after a backend restart). Cleared when the workstream is deleted or `portRange` changes.

`composeEnv(id)` wraps `getHostPort(id)` and must be passed to **every** compose call — `up`, `down`, `ps -q`, and `logs -f` (`log-manager.js`) — because compose interpolates the file on each of them, and an unset `HOST_PORT` there would not match the running stack.

Allocation only avoids ports Loop itself knows about; it does not probe the host, so keep `portRange` clear of other listeners.

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
