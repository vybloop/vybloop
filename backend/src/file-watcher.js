import chokidar from 'chokidar';
import { getChanges, getFileTree } from './data.js';

const watchers = new Map();
const runStartTimes = new Map(); // projectId -> start timestamp (ms)
const staleProjects = new Set(); // projects with file changes since run started

class ProjectWatcher {
  constructor(projectId) {
    this.projectId = projectId;
    this.clients = new Set();
    this._debounceTimer = null;
    this._chokidar = null;
  }

  _start() {
    const repoPath = `/data/${this.projectId}/git`;
    this._chokidar = chokidar.watch(repoPath, {
      ignored: /(^|[\/\\])\.git([\/\\]|$)/,
      ignoreInitial: true,
      persistent: true,
    });
    this._chokidar.on('all', () => this._schedule());
  }

  _stop() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = null;
    this._chokidar?.close();
    this._chokidar = null;
  }

  _schedule() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._broadcast(), 300);
  }

  async _broadcast() {
    if (this.clients.size === 0) return;
    const [changes, tree] = await Promise.all([
      getChanges(this.projectId),
      Promise.resolve(getFileTree(this.projectId)),
    ]);

    const wasStale = staleProjects.has(this.projectId);
    if (runStartTimes.has(this.projectId) && !wasStale) {
      staleProjects.add(this.projectId);
    }
    const nowStale = !wasStale && staleProjects.has(this.projectId);

    for (const res of this.clients) {
      if (changes !== null) sendEvent(res, 'changes', changes);
      sendEvent(res, 'files', tree ?? []);
      if (nowStale) sendEvent(res, 'stale', { stale: true });
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
  const watcher = watchers.get(projectId);
  if (!watcher) return;
  for (const res of watcher.clients) {
    sendEvent(res, 'agent-done', {});
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
