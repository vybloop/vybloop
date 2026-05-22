import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TerminalSession, DirectSession } from './terminal-session.js';
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
  getRemoteStatus,
  syncProject,
  getConfig,
  updateConfig,
  getFileTree,
  getFileContent,
  saveFileContent,
  getFileDiff,
  TEMPLATES,
} from './data.js';
import { getOrCreateWatcher } from './file-watcher.js';

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
  if (!result) return res.status(404).json({ error: 'not found' });
  if (!result.ok) return res.status(500).json({ error: result.error });
  res.json(result);
});

app.post('/api/projects/:id/run', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const result = toggleRun(req.params.id);
  res.json(result);
});

app.get('/api/projects/:id/remote-status', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const status = await getRemoteStatus(req.params.id);
  res.json(status);
});

app.post('/api/projects/:id/sync', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const result = await syncProject(req.params.id);
  if (!result) return res.status(404).json({ error: 'not found' });
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

app.get('/api/projects/:id/diff', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  const staged = req.query.staged === 'true';
  const result = await getFileDiff(req.params.id, filePath, staged);
  if (!result) return res.status(404).json({ error: 'not found' });
  res.json(result);
});

app.get('/api/projects/:id/files', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const tree = getFileTree(req.params.id);
  if (tree === null) return res.json([]);
  res.json(tree);
});

app.get('/api/projects/:id/file', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  const result = getFileContent(req.params.id, filePath);
  if (!result) return res.status(404).json({ error: 'file not found' });
  res.json(result);
});

app.put('/api/projects/:id/file', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  const { content, mtime, force } = req.body;
  if (content === undefined) return res.status(400).json({ error: 'content is required' });
  const result = saveFileContent(req.params.id, filePath, content, mtime ?? 0, force ?? false);
  if (!result) return res.status(404).json({ error: 'project not found' });
  if (result.conflict) return res.status(409).json(result);
  if (result.error) return res.status(500).json(result);
  res.json(result);
});

app.get('/api/templates', (req, res) => {
  res.json(TEMPLATES);
});

app.get('/api/github/status', async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.json({ available: false });
  try {
    const resp = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'loop-app' },
    });
    if (!resp.ok) return res.json({ available: false });
    const user = await resp.json();
    res.json({ available: true, username: user.login });
  } catch {
    res.json({ available: false });
  }
});

app.post('/api/github/repos', async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(400).json({ error: 'No GitHub token configured' });
  const { name, private: isPrivate = false } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const resp = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'loop-app',
      },
      body: JSON.stringify({ name, private: isPrivate, auto_init: true }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: data.message || 'Failed to create repository' });
    res.json({ url: data.clone_url, htmlUrl: data.html_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json(getConfig());
});

app.patch('/api/config', (req, res) => {
  const result = updateConfig(req.body);
  res.json(result);
});

app.get('/api/projects/:id/events', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial snapshot immediately
  const [changes, tree] = await Promise.all([
    getChanges(req.params.id),
    Promise.resolve(getFileTree(req.params.id)),
  ]);
  if (changes !== null) res.write(`event: changes\ndata: ${JSON.stringify(changes)}\n\n`);
  res.write(`event: files\ndata: ${JSON.stringify(tree ?? [])}\n\n`);

  getOrCreateWatcher(req.params.id).addClient(res);
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

  const { terminalMode } = getConfig();
  const cwd = process.env.HOME || '/home/poduser';
  const command = makeCommand(repoPath);

  const session = terminalMode === 'direct'
    ? new DirectSession({ command, cwd })
    : new TerminalSession({ sessionKey: tmuxName(projectId, type), command, cwd });

  session.onExit = () => sessions.delete(key);

  try {
    await session.start();
  } catch (err) {
    console.error(`Failed to start session for ${projectId}/${type}:`, err.message);
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
