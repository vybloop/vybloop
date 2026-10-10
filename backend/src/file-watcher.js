import chokidar from 'chokidar';
import { getChanges, getFileTree, getHasCompose, getRemoteStatus } from './data.js';

const watchers = new Map();
const runStartTimes = new Map(); // projectId -> start timestamp (ms)
const staleProjects = new Set(); // projects with file changes since run started

class ProjectWatcher {
  constructor(projectId) {
    this.projectId = projectId;
    this.clients = new Set();
    this._debounceTimer = null;
    this._chokidar = null;
    this._git = null;
    this._hasCompose = getHasCompose(projectId);
    this._lastChanges = null;
    this._lastRemote = null;
  }

  _start() {
    const repoPath = `/data/${this.projectId}/git`;
    this._chokidar = chokidar.watch(repoPath, {
      ignored: /(^|[\/\\])\.git([\/\\]|$)/,
      ignoreInitial: true,
      persistent: true,
    });
    this._chokidar.on('all', () => this._schedule());

    // The worktree watcher ignores `.git`, so git operations run outside the UI
    // — a commit, merge, rebase or checkout typed in the shell tab — produce no
    // event of their own and the changes list keeps showing work that is already
    // committed. Watch the handful of files that record git's state instead of
    // the whole directory: `.git/objects` churns constantly and would be a lot
    // of watches for no signal. Index/ref writes land via a `.lock` rename, so
    // the lock files themselves are noise.
    const gitPath = `${repoPath}/.git`;
    this._git = chokidar.watch(
      [
        `${gitPath}/HEAD`,
        `${gitPath}/index`,
        `${gitPath}/MERGE_HEAD`,
        `${gitPath}/ORIG_HEAD`,
        `${gitPath}/packed-refs`,
        `${gitPath}/refs`,
      ],
      { ignored: /\.lock$/, ignoreInitial: true, persistent: true },
    );
    this._git.on('all', () => this._schedule());
  }

  _stop() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = null;
    this._chokidar?.close();
    this._chokidar = null;
    this._git?.close();
    this._git = null;
  }

  _schedule() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._broadcast(), 300);
  }

  async _broadcast() {
    if (this.clients.size === 0) return;
    const [changes, tree, remote] = await Promise.all([
      getChanges(this.projectId),
      Promise.resolve(getFileTree(this.projectId)),
      getRemoteStatus(this.projectId).catch(() => null),
    ]);

    // A git op touches many paths at once; only tell clients when the answer
    // actually moved, so the changes list doesn't churn under the user.
    const changesJson = JSON.stringify(changes);
    const changesChanged = changesJson !== this._lastChanges;
    this._lastChanges = changesJson;
    const remoteJson = JSON.stringify(remote);
    const remoteChanged = remoteJson !== this._lastRemote;
    this._lastRemote = remoteJson;

    const wasStale = staleProjects.has(this.projectId);
    if (runStartTimes.has(this.projectId) && !wasStale) {
      staleProjects.add(this.projectId);
    }
    const nowStale = !wasStale && staleProjects.has(this.projectId);

    const hasCompose = getHasCompose(this.projectId);
    const composeChanged = hasCompose !== this._hasCompose;
    this._hasCompose = hasCompose;

    for (const res of this.clients) {
      if (changes !== null && changesChanged) sendEvent(res, 'changes', changes);
      if (remoteChanged) sendEvent(res, 'remote-status', remote);
      sendEvent(res, 'files', tree ?? []);
      if (nowStale) sendEvent(res, 'stale', { stale: true });
      if (composeChanged) sendEvent(res, 'compose', { hasCompose });
    }
  }

  addClient(res) {
    this.clients.add(res);
    if (this.clients.size === 1) this._start();
    res.on('close', () => this.removeClient(res));
  }

  removeClient(res) {
    this.clients.delete(res);
    if (this.clients.size === 0) {
      this._stop();
      watchers.delete(this.projectId);
    }
  }
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function getOrCreateWatcher(projectId) {
  if (!watchers.has(projectId)) {
    watchers.set(projectId, new ProjectWatcher(projectId));
  }
  return watchers.get(projectId);
}

// Tear down a project's watcher and close any open SSE connections. Used when
// a project is deleted so chokidar stops watching the now-removed directory.
export function destroyWatcher(projectId) {
  const watcher = watchers.get(projectId);
  if (watcher) {
    watcher._stop();
    for (const res of watcher.clients) {
      try { res.end(); } catch {}
    }
    watcher.clients.clear();
    watchers.delete(projectId);
  }
  runStartTimes.delete(projectId);
  staleProjects.delete(projectId);
}

export function broadcastStatus(projectId, status, detail = null) {
  const watcher = watchers.get(projectId);
  if (!watcher) return;
  for (const res of watcher.clients) {
    sendEvent(res, 'status', detail ? { status, detail } : { status });
  }
}

export function broadcastPorts(projectId, ports) {
  const watcher = watchers.get(projectId);
  if (!watcher) return;
  for (const res of watcher.clients) {
    sendEvent(res, 'ports', ports);
  }
}

export function broadcastAgentDone(projectId) {
  setAgentBusy(projectId, false);
  const watcher = watchers.get(projectId);
  if (!watcher) return;
  for (const res of watcher.clients) {
    sendEvent(res, 'agent-done', {});
  }
}

// Whether each project's agent is mid-turn. Set by the UserPromptSubmit hook
// (agent-start), cleared by the Stop hook (agent-done). Interrupting with Esc
// fires neither, so the agent terminal's output stream is the backstop: a
// working agent redraws its spinner/timer constantly, so a quiet PTY means the
// turn is over.
const AGENT_QUIET_MS = 15000;
const agentBusyTimers = new Map(); // projectId -> quiet-timeout handle

export function isAgentBusy(projectId) {
  return agentBusyTimers.has(projectId);
}

export function setAgentBusy(projectId, busy) {
  if (busy === isAgentBusy(projectId)) {
    if (busy) noteAgentOutput(projectId);
    return;
  }
  if (busy) {
    agentBusyTimers.set(projectId, null);
    noteAgentOutput(projectId);
  } else {
    clearTimeout(agentBusyTimers.get(projectId));
    agentBusyTimers.delete(projectId);
  }
  const watcher = watchers.get(projectId);
  if (!watcher) return;
  for (const res of watcher.clients) {
    sendEvent(res, 'agent-busy', { busy });
  }
}

// Called on agent PTY output; pushes back the quiet timeout while busy.
export function noteAgentOutput(projectId) {
  if (!agentBusyTimers.has(projectId)) return;
  clearTimeout(agentBusyTimers.get(projectId));
  agentBusyTimers.set(projectId,
    setTimeout(() => setAgentBusy(projectId, false), AGENT_QUIET_MS));
}

export function broadcastSharedImage(projectId, entry) {
  const watcher = watchers.get(projectId);
  if (!watcher) return;
  for (const res of watcher.clients) {
    sendEvent(res, 'shared-image', entry);
  }
}

export function notifyProjectStarted(projectId) {
  runStartTimes.set(projectId, Date.now());
  staleProjects.delete(projectId);
  // Broadcast cleared stale state to any connected clients
  const watcher = watchers.get(projectId);
  if (!watcher) return;
  for (const res of watcher.clients) {
    sendEvent(res, 'stale', { stale: false });
  }
}

export function notifyProjectStopped(projectId) {
  runStartTimes.delete(projectId);
  staleProjects.delete(projectId);
}

export function isProjectStale(projectId) {
  return staleProjects.has(projectId);
}
