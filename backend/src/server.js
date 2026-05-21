import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as pty from 'node-pty';
import {
  getProjects,
  getProject,
  createProject,
  cloneRepo,
  getChanges,
  commitChanges,
  toggleRun,
  toggleStage,
  TEMPLATES,
} from './data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve built frontend
app.use(express.static(join(__dirname, '../public')));

// API routes
app.get('/api/projects', (req, res) => {
  res.json(getProjects());
});

app.post('/api/projects', (req, res) => {
  const { name, repo, branch, template } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const project = createProject({ name, repo, branch, template });
  if (repo) cloneRepo(project.id, repo);
  res.status(201).json(project);
});

app.get('/api/projects/:id', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  res.json(project);
});

app.get('/api/projects/:id/changes', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  res.json(getChanges(req.params.id));
});

app.post('/api/projects/:id/commit', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const { message, paths } = req.body;
  const result = commitChanges(req.params.id, { message, paths: paths || [] });
  res.json(result);
});

app.post('/api/projects/:id/run', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const result = toggleRun(req.params.id);
  res.json(result);
});

app.post('/api/projects/:id/changes/:fileId/toggle', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const result = toggleStage(req.params.id, req.params.fileId);
  if (!result) return res.status(404).json({ error: 'file not found' });
  res.json(result);
});

app.get('/api/templates', (req, res) => {
  res.json(TEMPLATES);
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../public/index.html'));
});

// Per-project terminal sessions: Map<projectId, { pty, clients: Set<WebSocket>, scrollback: Buffer[] }>
const sessions = new Map();
const SCROLLBACK_LIMIT = 500;

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const match = req.url.match(/^\/api\/projects\/([^/]+)\/terminal$/);
  if (match) {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req, match[1]));
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req, projectId) => {
  const project = getProject(projectId);
  if (!project) {
    ws.close(1008, 'project not found');
    return;
  }

  if (sessions.has(projectId)) {
    // Reconnect to existing session: replay scrollback then attach
    const session = sessions.get(projectId);
    for (const chunk of session.scrollback) {
      ws.send(chunk);
    }
    session.clients.add(ws);
    // Resize the PTY to this client's terminal size if it sends one
    ws.on('message', msg => handleInput(session.pty, msg));
    ws.on('close', () => session.clients.delete(ws));
    return;
  }

  // Spawn a new container for this project
  const repoPath = `/data/${projectId}/git`;
  const shell = pty.spawn('podman', [
    'run', '--rm', '-it',
    '-v', `${repoPath}:/project`,
    '-v', '/claudeconfig:/claudeconfig',
    '--env', 'CLAUDE_CONFIG_DIR=/claudeconfig',
    '--env', 'ANTHROPIC_API_KEY',
    '--env', 'IS_SANDBOX=1',
    '--env', 'COLORTERM=truecolor',
    '-w', '/project',
    'claude-inner',
    'claude', '--dangerously-skip-permissions',
  ], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || '/home/poduser',
    env: process.env,
  });

  const session = { pty: shell, clients: new Set([ws]), scrollback: [] };
  sessions.set(projectId, session);

  shell.onData(data => {
    const buf = Buffer.from(data);
    session.scrollback.push(buf);
    if (session.scrollback.length > SCROLLBACK_LIMIT) session.scrollback.shift();
    for (const client of session.clients) {
      if (client.readyState === 1) client.send(buf);
    }
  });

  shell.onExit(() => {
    sessions.delete(projectId);
    for (const client of session.clients) {
      if (client.readyState === 1) {
        client.send(Buffer.from('\r\n\x1b[31m[Session ended]\x1b[0m\r\n'));
        client.close();
      }
    }
  });

  ws.on('message', msg => handleInput(shell, msg));
  ws.on('close', () => session.clients.delete(ws));
});

function handleInput(shell, msg) {
  try {
    const obj = JSON.parse(msg);
    if (obj.type === 'input') {
      shell.write(obj.data);
    } else if (obj.type === 'resize') {
      shell.resize(obj.cols, obj.rows);
    }
  } catch {
    shell.write(msg.toString());
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Loop server running on port ${PORT}`);
});
