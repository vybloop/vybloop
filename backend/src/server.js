import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { TerminalSession, DirectSession } from './terminal-session.js';
import { agentCommand, installCodexConfig, EDITOR_ENV } from './agent-cli.js';
import {
  getProjects,
  getProject,
  createProject,
  deleteProject,
  cloneRepo,
  initProject,
  getChanges,
  commitChanges,
  setProjectStatus,
  getProjectStatus,
  getHasCompose,
  toggleStage,
  revertFile,
  stageAll,
  getRemoteStatus,
  getDeletionImpact,
  syncProject,
  getConfig,
  getTimezone,
  updateConfig,
  setGithubPat,
  getFileTree,
  getFileContent,
  getImageContent,
  saveFileContent,
  getFileDiff,
  uploadFiles,
  uploadFile,
  createFolder,
  createFile,
  renameItem,
  deleteItem,
  searchFiles,
  createWorkstream,
  listWorkstreams,
  getWorkstreamIds,
  composeEnv,
  setProjectAgentCli,
  AGENT_CLIS,
} from './data.js';
import { listTemplates } from './templates.js';
import { getOrCreateWatcher, broadcastStatus, broadcastPorts, broadcastAgentDone, broadcastSharedImage, notifyProjectStarted, notifyProjectStopped, isProjectStale, destroyWatcher } from './file-watcher.js';
import { startIpcServer } from './ipc-server.js';
import {
  installShareTool, recordSharedImage, listSharedImages, getSharedImagePath,
  deleteSharedImage, clearSharedImages, sharedImageMime,
} from './shared-images.js';
import { startCredentialBroker } from './git-credential-broker.js';
import { getGithubStatus, createRepo, listRepoTargets } from './git-auth.js';
import { startBuildCapture, startLogCapture, stopLogCapture, getOrCreateBuffer } from './log-manager.js';

const execFileAsync = promisify(execFile);

async function composeDown(projectId, repoPath) {
  // Primary path: compose down handles stop + container removal + pod removal.
  // 3s SIGTERM timeout before SIGKILL keeps shutdown snappy.
  const ok = await execFileAsync('podman', ['compose', '-p', projectId, 'down', '--timeout', '3'], {
    cwd: repoPath, env: composeEnv(projectId), timeout: 30_000,
  }).then(() => true).catch(() => false);

  if (!ok) {
    // Fallback: explicitly remove containers then the pod. This handles the case
    // where compose down is blocked (e.g. a partially-removed pod from a prior crash).
    const { stdout } = await execFileAsync('podman', ['compose', '-p', projectId, 'ps', '-q'], {
      cwd: repoPath, env: composeEnv(projectId), timeout: 10_000,
    }).catch(() => ({ stdout: '' }));
    const ids = stdout.trim().split('\n').filter(Boolean);
    if (ids.length > 0) {
      await execFileAsync('podman', ['rm', '-f', ...ids], { timeout: 15_000 }).catch(() => {});
    }
    await execFileAsync('podman', ['pod', 'rm', '-f', `pod_${projectId}`], { timeout: 15_000 }).catch(() => {});
  }
}

async function getContainerPorts(projectId, repoPath) {
  const { stdout: idsOut } = await execFileAsync('podman', ['compose', '-p', projectId, 'ps', '-q'], { cwd: repoPath, env: composeEnv(projectId) });
  const ids = idsOut.trim().split('\n').filter(Boolean);
  const ports = [];
  for (const containerId of ids) {
    try {
      const { stdout } = await execFileAsync('podman', ['port', containerId]);
      for (const line of stdout.trim().split('\n').filter(Boolean)) {
        const match = line.match(/^(\d+)\/(tcp|udp)\s+->\s+[\d.]+:(\d+)$/);
        if (match) ports.push({ containerPort: +match[1], protocol: match[2], hostPort: +match[3] });
      }
    } catch { /* container may have no exposed ports */ }
  }
  return ports;
}

// Publish a project's port mappings to connected clients. `podman compose up -d`
// returns before the containers' port mappings are necessarily visible, so a
// single immediate probe often comes back empty and the UI sits on "starting…"
// until the user reloads. Poll until a mapping shows up (or we give up), and
// broadcast every time the answer changes so the UI converges on its own.
async function publishPorts(projectId, repoPath, { attempts = 20, intervalMs = 1500 } = {}) {
  const buf = getOrCreateBuffer(projectId);
  let last = null;
  let reportedError = false;
  for (let i = 0; i < attempts; i++) {
    let ports = [];
    try {
      ports = await getContainerPorts(projectId, repoPath);
    } catch (e) {
      console.error(`[compose] port detection failed for ${projectId}:`, e.message);
      if (!reportedError) buf.add(`[loop] Port detection failed: ${e.message}`);
      reportedError = true;
    }
    const serialized = JSON.stringify(ports);
    if (serialized !== last) {
      last = serialized;
      broadcastPorts(projectId, ports);
    }
    if (ports.length > 0) {
      buf.add(`[loop] Published ports: ${ports.map((p) => `${p.hostPort}->${p.containerPort}/${p.protocol}`).join(', ')}`);
      return ports;
    }
    // Stop polling if the stack went away (stopped, or the build died).
    if (getProjectStatus(projectId) !== 'running') return ports;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  // Giving up leaves the UI on "starting…" with no other signal, so explain it here.
  buf.add(`[loop] No published host ports found after ${Math.round((attempts * intervalMs) / 1000)}s, so the UI will stay on "starting…". A service must publish "\${HOST_PORT}:<port>". Container states:`);
  await logContainerStates(projectId, buf);
  return [];
}

const secs = (ms) => `${Math.round(ms / 1000)}s`;

// Append one line per compose container (name · status · image) to a log buffer.
// Status carries the useful bits: "Up 2 minutes (starting)" for a pending
// healthcheck, "Exited (1) 5 seconds ago" for a crash.
async function logContainerStates(projectId, buf) {
  try {
    const { stdout } = await execFileAsync('podman', [
      'ps', '-a', '--filter', `label=io.podman.compose.project=${projectId}`,
      '--format', '{{.Names}} · {{.Status}} · {{.Image}}',
    ], { timeout: 10_000 });
    const rows = stdout.trim().split('\n').filter(Boolean);
    if (rows.length === 0) buf.add('[loop]   (no containers created yet: still pulling images or building)');
    for (const row of rows) buf.add(`[loop]   ${row}`);
  } catch (e) {
    buf.add(`[loop]   Could not list containers: ${e.message}`);
  }
}

const COMPOSE_HEARTBEAT_MS = 20_000;

// Run `podman compose up` for a project, streaming its output into the Logs
// buffer. `up -d` can sit silent for minutes (pulling a multi-GB image, waiting
// on a `depends_on: condition: service_healthy` healthcheck), which from the UI
// is indistinguishable from a hang, so narrate the outcome and emit a heartbeat
// with container states whenever the command goes quiet. Throws on failure.
async function composeUp(id, repoPath, buf) {
  const args = ['compose', '-p', id, 'up', '--build', '--force-recreate', '-d'];
  const env = composeEnv(id);
  buf.add(`[loop] Running: podman ${args.join(' ')} (HOST_PORT=${env.HOST_PORT})`);
  const started = Date.now();
  let lastOutput = started;
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('podman', args, { cwd: repoPath, env });
      let pending = '';
      const onData = (chunk) => {
        lastOutput = Date.now();
        pending += chunk.toString();
        let nl;
        while ((nl = pending.indexOf('\n')) !== -1) {
          buf.add(pending.slice(0, nl));
          pending = pending.slice(nl + 1);
        }
      };
      const heartbeat = setInterval(() => {
        const quiet = Date.now() - lastOutput;
        if (quiet < COMPOSE_HEARTBEAT_MS) return;
        buf.add(`[loop] compose up still running: ${secs(Date.now() - started)} elapsed, no output for ${secs(quiet)}. Container states:`);
        logContainerStates(id, buf);
      }, COMPOSE_HEARTBEAT_MS);
      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);
      proc.on('error', (err) => { clearInterval(heartbeat); reject(err); });
      // 'close' (not 'exit') so every buffered line is in before we report.
      proc.on('close', (code, signal) => {
        clearInterval(heartbeat);
        if (pending.trim()) buf.add(pending);
        if (code === 0) resolve();
        else reject(new Error(signal ? `compose up killed by ${signal}` : `compose up exited with code ${code}`));
      });
    });
  } catch (err) {
    buf.add(`[loop] ${err.message} after ${secs(Date.now() - started)}. Container states:`);
    await logContainerStates(id, buf);
    throw err;
  }
  buf.add(`[loop] compose up finished in ${secs(Date.now() - started)}. Container states:`);
  await logContainerStates(id, buf);
}

// Stop everything live for a project id (a project or one of its workstreams)
// before its files are removed.
async function teardownProject(id, isRunning) {
  await destroyProjectSessions(id);
  stopLogCapture(id);
  destroyWatcher(id);
  notifyProjectStopped(id);
  clearSharedImages(id);
  if (isRunning) {
    await composeDown(id, `/data/${id}/git`).catch(() => {});
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
  if (project.error) return res.status(409).json({ error: project.error });
  if (repo) {
    cloneRepo(project.id, repo);
    // cloneRepo runs in the background and sets the live status to 'cloning';
    // reflect that in the response so the client waits for the clone to finish
    // (and surfaces any failure) rather than navigating to a not-yet-cloned repo.
    project.status = 'cloning';
  } else {
    initProject(project.id, project.template);
  }
  res.status(201).json(project);
});

app.get('/api/projects/:id', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  res.json(project);
});

app.delete('/api/projects/:id', async (req, res) => {
  const id = req.params.id;
  const project = await getProject(id);
  if (!project) return res.status(404).json({ error: 'not found' });

  // Tear down everything live for this project before removing its files, so we
  // don't leave orphaned containers, watchers, or log tails behind. Workstreams
  // are separate ids with their own sessions/containers, so they need the same
  // teardown explicitly — deleting the project deletes them too.
  for (const wsId of getWorkstreamIds(id)) {
    const ws = await getProject(wsId);
    await teardownProject(wsId, ws?.hasCompose && ws.status === 'running');
  }
  await teardownProject(id, project.hasCompose && project.status === 'running');

  const result = deleteProject(id);
  if (!result) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Workstreams: isolated repo copies of a project, each with its own branch and
// sandbox. Addressed by the composite id `<projectId>--<workstream>`, so every
// other /api/projects/:id/* route works on them unchanged.
app.get('/api/projects/:id/workstreams', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const list = listWorkstreams(project.parentId ?? project.id);
  if (!list) return res.status(404).json({ error: 'not found' });
  res.json(list);
});

app.post('/api/projects/:id/workstreams', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const result = createWorkstream(req.params.id, name);
  if (result.error) return res.status(result.code || 400).json({ error: result.error });
  res.status(201).json(result);
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
  if (!project.hasCompose) return res.status(400).json({ error: 'no compose file found' });

  const id = req.params.id;
  const repoPath = `/data/${id}/git`;
  const isRunning = project.status === 'running';

  if (project.status === 'stopping') {
    return res.status(409).json({ error: 'stop already in progress' });
  }

  if (isRunning) {
    setProjectStatus(id, 'stopping');
    broadcastStatus(id, 'stopping');
    notifyProjectStopped(id);
    res.json({ status: 'stopping' });
    stopLogCapture(id);
    composeDown(id, repoPath).then(() => {
      setProjectStatus(id, 'idle');
      broadcastStatus(id, 'idle');
    }).catch((err) => {
      console.error(`[compose] down failed for ${id}:`, err.message);
      setProjectStatus(id, 'error');
      broadcastStatus(id, 'error');
    });
  } else {
    setProjectStatus(id, 'running');
    broadcastStatus(id, 'running');
    notifyProjectStarted(id);
    res.json({ status: 'running' });
    const buf = startBuildCapture(id);
    (async () => {
      // Remove any leftover pod from a prior crashed shutdown — compose up will
      // fail if the pod already exists, even with --force-recreate.
      await execFileAsync('podman', ['pod', 'rm', '-f', `pod_${id}`], { timeout: 10_000 }).catch(() => {});
      try {
        await composeUp(id, repoPath, buf);
        startLogCapture(id, repoPath);
        publishPorts(id, repoPath);
      } catch (err) {
        console.error(`[compose] up failed for ${id}:`, err.message);
        setProjectStatus(id, 'error');
        broadcastStatus(id, 'error', 'Build failed — check the Logs tab');
        notifyProjectStopped(id);
      }
    })();
  }
});

app.post('/api/projects/:id/restart', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  if (!project.hasCompose) return res.status(400).json({ error: 'no compose file found' });

  const id = req.params.id;
  const repoPath = `/data/${id}/git`;
  notifyProjectStarted(id);
  res.json({ status: 'running' });
  stopLogCapture(id);
  const buf = startBuildCapture(id);

  buf.add('[loop] Restart: stopping the existing stack');
  try {
    await composeDown(id, repoPath);
  } catch (downErr) {
    console.error(`[compose] restart/down failed for ${id}:`, downErr.message);
    buf.add(`[loop] Stopping the existing stack failed: ${downErr.message}`);
  }

  (async () => {
    try {
      await composeUp(id, repoPath, buf);
      startLogCapture(id, repoPath);
      // A restart leaves the row 'running', but re-broadcasting clears any build
      // error the UI is still showing from a previous failed run.
      setProjectStatus(id, 'running');
      broadcastStatus(id, 'running');
      publishPorts(id, repoPath);
    } catch (upErr) {
      console.error(`[compose] restart/up failed for ${id}:`, upErr.message);
      setProjectStatus(id, 'error');
      broadcastStatus(id, 'error', 'Build failed — check the Logs tab');
      notifyProjectStopped(id);
    }
  })();
});

app.get('/api/projects/:id/ports', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  try {
    res.json(await getContainerPorts(req.params.id, `/data/${req.params.id}/git`));
  } catch {
    res.json([]);
  }
});

app.get('/api/projects/:id/remote-status', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const status = await getRemoteStatus(req.params.id);
  res.json(status);
});

// Work that deleting this project/workstream would destroy — commits on no
// remote, plus uncommitted files. Powers the delete confirmation's warning.
app.get('/api/projects/:id/deletion-impact', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const impact = await getDeletionImpact(req.params.id);
  if (!impact) return res.status(404).json({ error: 'not found' });
  res.json(impact);
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

app.post('/api/projects/:id/changes/:fileId/revert', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const result = await revertFile(req.params.id, req.params.fileId);
  if (!result) return res.status(404).json({ error: 'file not found' });
  if (result.error) return res.status(400).json(result);
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

app.get('/api/projects/:id/search', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const q = req.query.q;
  if (!q || q.trim() === '') return res.json({ results: [], total: 0 });
  const caseSensitive = req.query.caseSensitive === 'true';
  const result = searchFiles(req.params.id, q, caseSensitive, 100);
  if (!result) return res.status(404).json({ error: 'project not found' });
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

const IMAGE_MIME_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif',
};

app.get('/api/projects/:id/image', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  const result = getImageContent(req.params.id, filePath);
  if (!result) return res.status(404).json({ error: 'file not found' });
  const mime = IMAGE_MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.send(result.data);
});

// Images an inner agent shared with the UI via /claudeconfig/loop-share-image.sh.
app.get('/api/projects/:id/shared-images', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  res.json(listSharedImages(req.params.id));
});

app.get('/api/projects/:id/shared-images/:file', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const full = getSharedImagePath(req.params.id, req.params.file);
  if (!full) return res.status(404).json({ error: 'image not found' });
  res.setHeader('Content-Type', sharedImageMime(req.params.file));
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(full);
});

app.delete('/api/projects/:id/shared-images/:file', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  if (!deleteSharedImage(req.params.id, req.params.file)) {
    return res.status(400).json({ error: 'bad file name' });
  }
  res.json({ ok: true });
});

app.delete('/api/projects/:id/shared-images', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  clearSharedImages(req.params.id);
  res.json({ ok: true });
});

app.post('/api/projects/:id/upload', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const { dir = '', files } = req.body;
  if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'files required' });
  const result = uploadFiles(req.params.id, dir, files);
  if (!result) return res.status(404).json({ error: 'project not found' });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Raw binary upload of a single file: the body is the file itself, so large
// uploads avoid base64 expansion and a multi-megabyte JSON body.
app.post('/api/projects/:id/upload-raw', express.raw({ type: '*/*', limit: '1gb' }), async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'body is required' });
  const result = uploadFile(req.params.id, req.query.dir ?? '', name, req.body);
  if (!result) return res.status(404).json({ error: 'project not found' });
  if (result.error) return res.status(400).json(result);
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

app.post('/api/projects/:id/fs/mkdir', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: 'path is required' });
  const result = createFolder(req.params.id, path);
  if (!result) return res.status(404).json({ error: 'project not found' });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/projects/:id/fs/touch', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: 'path is required' });
  const result = createFile(req.params.id, path);
  if (!result) return res.status(404).json({ error: 'project not found' });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/projects/:id/fs/rename', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const { oldPath, newPath } = req.body;
  if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath are required' });
  const result = renameItem(req.params.id, oldPath, newPath);
  if (!result) return res.status(404).json({ error: 'project not found' });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/projects/:id/fs/delete', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: 'path is required' });
  const result = deleteItem(req.params.id, path);
  if (!result) return res.status(404).json({ error: 'project not found' });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.get('/api/templates', (req, res) => {
  res.json(listTemplates());
});

// Drives the new-project "create a repo" flow: which accounts we can create
// under (owners), plus context for a helpful message when we can't.
app.get('/api/github/status', async (req, res) => {
  try {
    const status = await getGithubStatus();
    const owners = await listRepoTargets();
    res.json({
      available: owners.length > 0,
      mode: status.mode,
      owners,
      // Accounts the app is installed on (App mode) — used to explain why
      // creation may be unavailable even though the app is connected.
      installedAccounts: status.installations?.map(i => i.account) ?? [],
      installUrl: status.installUrl,
    });
  } catch {
    res.json({ available: false, owners: [] });
  }
});

app.post('/api/github/repos', async (req, res) => {
  const { name, private: isPrivate = false, owner } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const result = await createRepo({ name, isPrivate, owner });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json(getConfig());
});

app.patch('/api/config', async (req, res) => {
  // `agentCli` here is only the default for projects that have not picked one
  // of their own; live sessions are deliberately left running, so a switch made
  // elsewhere never yanks the CLI out from under a working agent. Per-project
  // switching (with a restart) is POST /api/projects/:id/agent-cli below.
  res.json(updateConfig(req.body));
});

// Switch one project (or workstream) to an agent CLI. Only that project's agent
// session is torn down — it reconnects on the new CLI — so other workstreams
// keep running whatever they were started with. The pick also becomes the
// default for projects that have not chosen one.
app.post('/api/projects/:id/agent-cli', async (req, res) => {
  const { agentCli } = req.body;
  if (!AGENT_CLIS.includes(agentCli)) return res.status(400).json({ error: 'unknown agentCli' });
  if (!setProjectAgentCli(req.params.id, agentCli)) return res.status(404).json({ error: 'not found' });
  // Which CLI runs is baked into the container's argv, so the switch only takes
  // effect once this project's agent session is gone and respawns. The shell is
  // left alone — it runs bash either way.
  await destroyProjectSessions(req.params.id, 'agent').catch(() => {});
  res.json({ agentCli });
});

// GitHub auth status for the settings UI: GitHub App ("app") mode with its
// installations, or PAT fallback ("pat"/"none") mode.
app.get('/api/config/github', async (req, res) => {
  res.json(await getGithubStatus());
});

// Set the PAT (only meaningful in PAT/none mode; ignored when a GitHub App is configured).
app.post('/api/config/github/pat', async (req, res) => {
  const { pat } = req.body;
  if (typeof pat !== 'string') return res.status(400).json({ error: 'pat must be a string' });
  setGithubPat(pat);
  res.json(await getGithubStatus());
});

app.get('/api/projects/:id/logs', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  getOrCreateBuffer(req.params.id).addClient(res);
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
  if (isProjectStale(req.params.id)) res.write(`event: stale\ndata: ${JSON.stringify({ stale: true })}\n\n`);

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
  // The agent command depends on the selected CLI (Claude Code or Codex), so it
  // is built in agent-cli.js rather than being a fixed argv here.
  agent: agentCommand,
  shell: (repoPath) => [
    'podman', 'run', '--rm', '-it',
    '-v', `${repoPath}:/project`,
    '-v', '/claudeconfig:/claudeconfig',
    '--env', 'GIT_CONFIG_GLOBAL=/claudeconfig/gitconfig',
    '--env', `TZ=${getTimezone()}`,
    ...EDITOR_ENV,
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
  const command = makeCommand(repoPath, projectId);

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

// Tear down all live agent/shell sessions (the per-project `claude-inner`
// containers) so they respawn fresh on the next WebSocket reconnect. Used by the
// sandbox restart/rebuild endpoints to pick up image or config changes.
// Pass a session type ('agent' | 'shell' | 'logs') to tear down only those.
async function destroyAllSessions(type) {
  const matches = [...sessions.entries()].filter(([key]) => !type || key.endsWith(`:${type}`));
  for (const [key] of matches) sessions.delete(key);
  await Promise.all(matches.map(([, s]) => s.destroy().catch(() => {})));
}

// Destroy the sessions belonging to one project (agent/shell/logs), or just one
// type of them. The `${projectId}:` prefix (with the colon) ensures e.g. "miner"
// doesn't match "miner-4:agent".
async function destroyProjectSessions(projectId, type) {
  const matches = [...sessions.entries()].filter(([key]) =>
    key.startsWith(`${projectId}:`) && (!type || key.endsWith(`:${type}`)));
  for (const [key, session] of matches) {
    sessions.delete(key);
    await session.destroy().catch(() => {});
  }
}

const INNER_CONTAINER_DIR = join(__dirname, '../inner-container');

// Rebuild the `claude-inner` sandbox image. Mirrors the build in start.sh,
// stamping the Dockerfile hash label so start.sh won't redundantly rebuild.
async function rebuildSandboxImage() {
  const dockerfile = readFileSync(join(INNER_CONTAINER_DIR, 'Dockerfile'));
  const hash = createHash('sha256').update(dockerfile).digest('hex');
  // --no-cache forces every layer to rebuild, including the `npm install -g
  // @anthropic-ai/claude-code` layer — otherwise podman reuses the cached layer
  // and the sandbox keeps an old Claude Code version even after a "rebuild".
  await execFileAsync('podman', [
    'build', '--no-cache', '-t', 'claude-inner',
    '--label', `dockerfile-hash=${hash}`,
    INNER_CONTAINER_DIR,
  ], { timeout: 600_000 });
  return await sandboxVersions();
}

// Agent CLI versions baked into the current `claude-inner` image, so the UI can
// confirm a rebuild actually moved them forward. `claude --version` prints
// "<version> (Claude Code)" and `codex --version` prints "codex-cli <version>",
// so take the first token that looks like a version rather than a fixed field.
async function sandboxVersions() {
  const read = async (bin) => {
    try {
      const { stdout } = await execFileAsync('podman', [
        'run', '--rm', 'claude-inner', bin, '--version',
      ], { timeout: 60_000 });
      return stdout.trim().split(/\s+/).find(t => /^\d+\./.test(t)) || null;
    } catch {
      return null;
    }
  };
  const [claude, codex] = await Promise.all([read('claude'), read('codex')]);
  return { claude, codex };
}

// Restart the sandbox: kill running sessions so they reconnect with the current
// image. Does not rebuild — use /api/sandbox/rebuild for that.
app.post('/api/sandbox/restart', async (req, res) => {
  try {
    await destroyAllSessions();
    res.json({ ok: true });
  } catch (err) {
    console.error('Sandbox restart failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Rebuild the sandbox image, then restart sessions so the new image takes effect.
app.post('/api/sandbox/rebuild', async (req, res) => {
  try {
    // Build BEFORE tearing down sessions. The build takes minutes, and the
    // frontend reconnects its terminal WebSockets the instant a session dies —
    // destroying first meant every client respawned a container from the *old*
    // image while the new one was still building, so a "rebuild" appeared to do
    // nothing. Building first means the sessions killed below can only come
    // back on the new image.
    const versions = await rebuildSandboxImage();
    await destroyAllSessions();
    res.json({ ok: true, versions });
  } catch (err) {
    console.error('Sandbox rebuild failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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

  // The agent/shell container bind-mounts repoPath into /project. If the repo
  // dir doesn't exist (e.g. the clone failed or hasn't finished), podman fails
  // with a cryptic "statfs <path>: no such file or directory" that only shows
  // up in the terminal stream. Catch it here so we log it and tell the user.
  if ((sessionType === 'agent' || sessionType === 'shell') && !existsSync(repoPath)) {
    console.error(`[ws] ${projectId}/${sessionType}: repo path ${repoPath} does not exist (clone failed or incomplete); refusing to start session`);
    ws.send(Buffer.from(`\r\n\x1b[31mProject repository is not available at ${repoPath}.\r\nThe clone may have failed or is still in progress — check the server logs.\x1b[0m\r\n`));
    ws.close(1011, 'repo not available');
    return;
  }

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

async function restoreComposeStates() {
  const allProjects = await getProjects();
  for (const p of allProjects) {
    if (!p.hasCompose) continue;
    const repoPath = `/data/${p.id}/git`;
    try {
      const { stdout } = await execFileAsync('podman', ['compose', '-p', p.id, 'ps', '-q'], { cwd: repoPath, env: composeEnv(p.id) });
      if (stdout.trim()) {
        setProjectStatus(p.id, 'running');
        notifyProjectStarted(p.id);
        startLogCapture(p.id, repoPath);
        console.log(`[compose] restored running state for ${p.id}`);
      }
    } catch {
      // compose not available or no containers running
    }
  }
}

startIpcServer((msg) => {
  if (msg.event === 'agent-done' && msg.projectId) {
    broadcastAgentDone(msg.projectId);
  }
  if (msg.event === 'image-shared' && msg.projectId) {
    const entry = recordSharedImage(msg);
    if (entry) broadcastSharedImage(msg.projectId, entry);
  }
});

try {
  installShareTool();
} catch (err) {
  console.error('[shared-images] failed to install share tool:', err.message);
}

try {
  installCodexConfig();
} catch (err) {
  console.error('[agent-cli] failed to install codex config:', err.message);
}

startCredentialBroker();

const PORT = process.env.PORT || 9876;
server.listen(PORT, () => {
  console.log(`Loop server running on port ${PORT}`);
  //restoreComposeStates().catch(console.error);
});
