import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TerminalSession } from './terminal-session.js';
import {
  getProjects,
  getProject,
  createProject,
  cloneRepo,
  getChanges,
  commitChanges,
  toggleRun,
  toggleStage,
  stageAll,
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
app.get('/api/projects', async (req, res) => {
  res.json(await getProjects());
});

app.post('/api/projects', (req, res) => {
  const { name, repo, branch, template } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const project = createProject({ name, repo, branch, template });
  if (repo) cloneRepo(project.id, repo);
  res.status(201).json(project);
});

app.get('/api/projects/:id', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  res.json(project);
});

app.get('/api/projects/:id/changes', async (req, res) => {
  const changes = await getChanges(req.params.id);
  if (changes === null) return res.status(404).json({ error: 'not found' });
  res.json(changes);
});

app.post('/api/projects/:id/commit', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'message is required' });
  const result = await commitChanges(req.params.id, { message });
  res.json(result);
});

app.post('/api/projects/:id/run', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const result = toggleRun(req.params.id);
  res.json(result);
});

app.post('/api/projects/:id/changes/stage-all', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const files = await stageAll(req.params.id);
  res.json(files);
});

app.post('/api/projects/:id/changes/:fileId/toggle', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const result = await toggleStage(req.params.id, req.params.fileId);
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

// Per-project terminal sessions: Map<`${projectId}:${type}`, TerminalSession>
// type is 'agent' | 'shell' | 'logs'
const sessions = new Map();

function sessionKey(projectId, type) {
  return `${projectId}:${type}`;
}

// tmux session names must not contain colons; use hyphens
function tmuxName(projectId, type) {
  return `loop-${projectId}-${type}`;
}

const SESSION_COMMANDS = {
  agent: (repoPath) => [
    'podman', 'run', '--rm', '-it',
    '-v', `${repoPath}:/project`,
    '-v', '/claudeconfig:/claudeconfig',
    '--env', 'CLAUDE_CONFIG_DIR=/claudeconfig',
    '--env', 'ANTHROPIC_API_KEY',
    '--env', 'IS_SANDBOX=1',
    '--env', 'COLORTERM=truecolor',
    '-w', '/project',
    'claude-inner',
    'claude', '--dangerously-skip-permissions',
  ],
  shell: (repoPath) => [
    'podman', 'run', '--rm', '-it',
    '-v', `${repoPath}:/project`,
    '-w', '/project',
    'claude-inner',
    'bash',
  ],
};

async function getOrCreateSession(projectId, type, repoPath) {
  const key = sessionKey(projectId, type);
  const existing = sessions.get(key);
  if (existing?.alive) return existing;
  if (existing) sessions.delete(key);

  const makeCommand = SESSION_COMMANDS[type];
  if (!makeCommand) return null;

  const session = new TerminalSession({
    sessionKey: tmuxName(projectId, type),
    command: makeCommand(repoPath),
    cwd: process.env.HOME || '/home/poduser',
  });
  session.onExit = () => sessions.delete(key);

  try {
    await session.start();
  } catch (err) {
    console.error(`Failed to start tmux session ${tmuxName(projectId, type)}:`, err.message);
    return null;
  }

  sessions.set(key, session);
  return session;
}

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  // /api/projects/:id/ws/:type  (type = agent | shell | logs)
  const match = req.url.match(/^\/api\/projects\/([^/]+)\/ws\/([^/]+)$/);
  if (match) {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req, match[1], match[2]));
  } else {
    socket.destroy();
  }
});

wss.on('connection', async (ws, req, projectId, sessionType) => {
  const project = await getProject(projectId);
  if (!project) {
    ws.close(1008, 'project not found');
    return;
  }

  const repoPath = `/data/${projectId}/git`;
  const session = await getOrCreateSession(projectId, sessionType, repoPath);

  if (!session) {
    ws.close(1008, 'unknown session type');
    return;
  }

  const ok = await session.attach(ws);
  if (!ok) {
    ws.close(1011, 'session not available');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Loop server running on port ${PORT}`);
});
