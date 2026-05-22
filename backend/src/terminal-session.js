import * as pty from 'node-pty';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TMUX_CONF = join(__dirname, '../tmux.conf');

// Prefix every tmux invocation with -f <conf> -u (force UTF-8)
function tmuxArgs(...args) {
  return ['-f', TMUX_CONF, '-u', ...args];
}

// Manages one persistent tmux session (the app) and N client connections to it.
// Each client gets its own grouped tmux session so window resizes are isolated.
export class TerminalSession {
  constructor({ sessionKey, command, cwd }) {
    this.sessionKey = sessionKey;   // tmux session name for the app
    this.command = command;         // string[] — command to run in the tmux session
    this.cwd = cwd || process.env.HOME || '/';
    this.clients = new Map();       // ws -> { pty, clientSessionName }
    this.alive = false;
    this.onExit = null;             // called when the underlying session exits
    this._monitorTimer = null;
  }

  async start() {
    await execFileAsync('tmux', tmuxArgs(
      'new-session', '-d',
      '-s', this.sessionKey,
      '--', ...this.command,
    ), { env: process.env });
    this.alive = true;
    this._startMonitoring();
  }

  // Attach a WebSocket client. Spawns a grouped tmux session for this client.
  // Returns false if the underlying session is no longer alive.
  async attach(ws, cols = 80, rows = 24) {
    if (!this.alive) return false;

    const clientSessionName = `${this.sessionKey}-c${randomBytes(4).toString('hex')}`;

    // Unset TMUX so tmux doesn't refuse to nest; force UTF-8 locale
    const env = { ...process.env, TERM: 'xterm-256color', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
    delete env.TMUX;
    delete env.TMUX_PANE;

    const ptyProc = pty.spawn('tmux', tmuxArgs(
      'new-session',
      '-t', this.sessionKey,
      '-s', clientSessionName,
      '-x', String(cols),
      '-y', String(rows),
    ), {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: this.cwd,
      env,
    });

    this.clients.set(ws, { pty: ptyProc, clientSessionName });

    ptyProc.onData(data => {
      if (ws.readyState === 1) ws.send(Buffer.from(data));
    });

    ptyProc.onExit(() => {
      // The client tmux session ended (e.g. main session exited)
      this.clients.delete(ws);
      if (ws.readyState === 1) ws.close();
    });

    ws.on('message', msg => this._handleInput(ptyProc, msg));
    ws.on('close', () => this._detachClient(ws));

    return true;
  }

  _detachClient(ws) {
    const entry = this.clients.get(ws);
    if (!entry) return;
    this.clients.delete(ws);
    const { pty: ptyProc, clientSessionName } = entry;
    try { ptyProc.kill(); } catch {}
    // Kill the client's grouped tmux session; the main session keeps running
    execFile('tmux', tmuxArgs('kill-session', '-t', clientSessionName), () => {});
  }

  _handleInput(ptyProc, msg) {
    try {
      const obj = JSON.parse(msg);
      if (obj.type === 'input') ptyProc.write(obj.data);
      else if (obj.type === 'resize') ptyProc.resize(obj.cols, obj.rows);
    } catch {
      ptyProc.write(msg.toString());
    }
  }

  _startMonitoring() {
    const check = () => {
      if (!this.alive) return;
      execFile('tmux', tmuxArgs('has-session', '-t', this.sessionKey), err => {
        if (err) {
          this._handleSessionExit();
        } else {
          this._monitorTimer = setTimeout(check, 2000);
        }
      });
    };
    this._monitorTimer = setTimeout(check, 3000);
  }

  _handleSessionExit() {
    if (!this.alive) return;
    this.alive = false;
    clearTimeout(this._monitorTimer);
    for (const [ws, { pty: p }] of this.clients) {
      try { p.kill(); } catch {}
      if (ws.readyState === 1) {
        ws.send(Buffer.from('\r\n\x1b[31m[Session ended]\x1b[0m\r\n'));
        ws.close();
      }
    }
    this.clients.clear();
    this.onExit?.();
  }

  async destroy() {
    this.alive = false;
    clearTimeout(this._monitorTimer);
    for (const [ws, { pty: p, clientSessionName }] of this.clients) {
      try { p.kill(); } catch {}
      execFile('tmux', tmuxArgs('kill-session', '-t', clientSessionName), () => {});
      if (ws.readyState === 1) ws.close();
    }
    this.clients.clear();
    try { await execFileAsync('tmux', tmuxArgs('kill-session', '-t', this.sessionKey)); } catch {}
  }
}

// Runs the command directly in a PTY without tmux. The process persists across
// WebSocket disconnections but does not support scrollback replay on reconnect.
export class DirectSession {
  constructor({ command, cwd }) {
    this.command = command;
    this.cwd = cwd || process.env.HOME || '/';
    this.alive = false;
    this.onExit = null;
    this._pty = null;
    this._clients = new Set();
  }

  async start() {
    const [file, ...args] = this.command;
    const env = { ...process.env, TERM: 'xterm-256color', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };

    this._pty = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: this.cwd,
      env,
    });

    this.alive = true;

    this._pty.onData(data => {
      const buf = Buffer.from(data);
      for (const ws of this._clients) {
        if (ws.readyState === 1) ws.send(buf);
      }
    });

    this._pty.onExit(() => {
      this.alive = false;
      for (const ws of this._clients) {
        if (ws.readyState === 1) {
          ws.send(Buffer.from('\r\n\x1b[31m[Session ended]\x1b[0m\r\n'));
          ws.close();
        }
      }
      this._clients.clear();
      this.onExit?.();
    });
  }

  async attach(ws) {
    if (!this.alive) return false;
    this._clients.add(ws);
    ws.on('message', msg => this._handleInput(msg));
    ws.on('close', () => this._clients.delete(ws));
    return true;
  }

  _handleInput(msg) {
    try {
      const obj = JSON.parse(msg);
      if (obj.type === 'input') this._pty.write(obj.data);
      else if (obj.type === 'resize') this._pty.resize(obj.cols, obj.rows);
    } catch {
      this._pty.write(msg.toString());
    }
  }

  async destroy() {
    this.alive = false;
    try { this._pty?.kill(); } catch {}
    for (const ws of this._clients) {
      if (ws.readyState === 1) ws.close();
    }
    this._clients.clear();
  }
}
