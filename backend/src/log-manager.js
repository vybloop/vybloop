import { spawn } from 'child_process';
import { composeEnv } from './data.js';

const MAX_BYTES = 1024 * 1024; // 1MB rolling window

// Strip common ANSI escape sequences
function stripAnsi(str) {
  return str
    .replace(/\x1b\[[0-9;]*[mGKHFABCDEFsu]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/\r/g, '');
}

class LogBuffer {
  constructor() {
    this._lines = [];
    this._bytes = 0;
    this._clients = new Set();
  }

  add(raw) {
    const line = stripAnsi(raw);
    if (!line) return;
    const lineBytes = Buffer.byteLength(line + '\n', 'utf8');
    this._lines.push(line);
    this._bytes += lineBytes;
    while (this._bytes > MAX_BYTES && this._lines.length > 1) {
      const removed = this._lines.shift();
      this._bytes -= Buffer.byteLength(removed + '\n', 'utf8');
    }
    for (const res of this._clients) {
      _send(res, 'line', line);
    }
  }

  snapshot() {
    return this._lines.join('\n');
  }

  addClient(res) {
    _send(res, 'snapshot', this.snapshot());
    this._clients.add(res);
    res.on('close', () => this._clients.delete(res));
  }
}

function _send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const buffers = new Map(); // projectId -> LogBuffer
const procs = new Map();   // projectId -> ChildProcess

export function startBuildCapture(projectId) {
  const existing = procs.get(projectId);
  if (existing) { existing.kill(); procs.delete(projectId); }
  const buf = new LogBuffer();
  buffers.set(projectId, buf);
  return buf;
}

export function startLogCapture(projectId, repoPath) {
  // Kill any existing capture process
  const existing = procs.get(projectId);
  if (existing) { existing.kill(); procs.delete(projectId); }

  // Append to existing buffer (build output may already be there)
  const buf = getOrCreateBuffer(projectId);

  const proc = spawn('podman', ['compose', '-p', projectId, 'logs', '-f'], { cwd: repoPath, env: composeEnv(projectId) });
  procs.set(projectId, proc);

  let pending = '';
  const onData = (chunk) => {
    pending += chunk.toString();
    let nl;
    while ((nl = pending.indexOf('\n')) !== -1) {
      buf.add(pending.slice(0, nl));
      pending = pending.slice(nl + 1);
    }
  };

  buf.add('[loop] Following container logs (podman compose logs -f)');
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('error', (err) => buf.add(`[loop] Could not follow container logs: ${err.message}`));
  proc.on('close', (code, signal) => {
    if (pending.trim()) buf.add(pending);
    // A capture we replaced or stopped ourselves is expected to end; any other
    // exit means the containers went away or compose failed, so say so.
    if (procs.get(projectId) !== proc) return;
    procs.delete(projectId);
    buf.add(`[loop] Container log stream ended (${signal ? `signal ${signal}` : `exit code ${code}`}) — containers may have stopped`);
  });
}

export function stopLogCapture(projectId) {
  const proc = procs.get(projectId);
  if (proc) { proc.kill(); procs.delete(projectId); }
  // Keep the buffer so users can read logs after stop
}

export function getOrCreateBuffer(projectId) {
  if (!buffers.has(projectId)) buffers.set(projectId, new LogBuffer());
  return buffers.get(projectId);
}
