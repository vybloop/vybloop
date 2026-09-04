import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, renameSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, normalize, basename, relative } from 'path';
import { spawn, execFile } from 'child_process';
import { getTemplateClaudeMd } from './templates.js';
import { setStoredPat } from './git-auth.js';

// Route every git invocation (clone, push/fetch, identity) through the shared
// global config in /claudeconfig, which carries the credential helper (see
// git-credential-broker.js) and the user identity. Inner containers point at the
// same file via GIT_CONFIG_GLOBAL, so credentials work identically everywhere.
// Must be set before any `git` runs (e.g. applyGitAuthor on module load).
process.env.GIT_CONFIG_GLOBAL = '/claudeconfig/gitconfig';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '../../data/projects.json');

// `timezone` is an IANA zone name; it is passed to the sandbox containers as TZ
// so Claude Code (and anything else in there) reports the user's local time.
const DEFAULT_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_CONFIG = { terminalMode: 'direct', gitName: '', gitEmail: '', githubPat: '', portRange: '22000-23000', nextPort: 22000, timezone: DEFAULT_TIMEZONE };
const DEFAULT_DB = { projects: [], config: { ...DEFAULT_CONFIG } };

function load() {
  try {
    const raw = readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_DB };
    return {
      projects: parsed.projects ?? [],
      config: { ...DEFAULT_CONFIG, ...(parsed.config ?? {}) },
    };
  } catch {
    return { ...DEFAULT_DB };
  }
}

function save(db) {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

const db = load();
let projects = db.projects.map(({ status, ...p }) => p);
let config = db.config;

// Make the persisted PAT available to git-auth's fallback ("PAT mode").
setStoredPat(config.githubPat);

const projectStatus = {};
for (const p of projects) {
  projectStatus[p.id] = 'idle';
}

// Last error message per project (e.g. why a clone failed), surfaced in the UI
// alongside an 'error' status. Cleared when the project reaches a good state.
const projectErrors = {};

function persist() {
  db.projects = projects;
  db.config = config;
  save(db);
}

function gitDir(id) {
  return `/data/${id}/git`;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', '__pycache__', 'dist', '.venv', 'venv']);

function buildTree(dirPath, maxDepth = 6, depth = 0) {
  if (depth >= maxDepth) return [];
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const result = [];
  for (const entry of entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      result.push({ name: entry.name, type: 'dir', children: buildTree(join(dirPath, entry.name), maxDepth, depth + 1) });
    } else {
      result.push({ name: entry.name, type: 'file' });
    }
  }
  return result;
}

export function getFileTree(id) {
  const dir = gitDir(id);
  if (!existsSync(dir)) return null;
  return buildTree(dir);
}

export function getFileContent(id, filePath) {
  const base = gitDir(id);
  if (!existsSync(base)) return null;
  const abs = resolve(base, normalize(filePath));
  if (!abs.startsWith(base + '/') && abs !== base) return null;
  try {
    const stat = statSync(abs);
    if (!stat.isFile()) return null;
    const content = readFileSync(abs, 'utf8');
    return { content, mtime: stat.mtimeMs };
  } catch {
    return null;
  }
}

export function getImageContent(id, filePath) {
  const base = gitDir(id);
  if (!existsSync(base)) return null;
  const abs = resolve(base, normalize(filePath));
  if (!abs.startsWith(base + '/') && abs !== base) return null;
  try {
    const stat = statSync(abs);
    if (!stat.isFile()) return null;
    const data = readFileSync(abs);
    return { data };
  } catch {
    return null;
  }
}

export function saveFileContent(id, filePath, content, mtime, force = false) {
  const base = gitDir(id);
  if (!existsSync(base)) return null;
  const abs = resolve(base, normalize(filePath));
  if (!abs.startsWith(base + '/') && abs !== base) return null;
  try {
    if (!force) {
      let currentMtime = 0;
      try { currentMtime = statSync(abs).mtimeMs; } catch { /* new file */ }
      if (currentMtime !== mtime) return { conflict: true, mtime: currentMtime };
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
    return { ok: true, mtime: statSync(abs).mtimeMs };
  } catch (e) {
    return { error: e.message };
  }
}

export async function getFileDiff(id, filePath, staged) {
  const cwd = gitDir(id);
  if (!existsSync(cwd)) return null;
  const base = cwd;
  const abs = resolve(base, normalize(filePath));
  if (!abs.startsWith(base + '/') && abs !== base) return null;

  let original = '';
  let modified = '';

  if (staged) {
    [original, modified] = await Promise.all([
      runGit(cwd, ['show', `HEAD:${filePath}`]),
      runGit(cwd, ['show', `:${filePath}`]),
    ]);
  } else {
    original = await runGit(cwd, ['show', `:${filePath}`]);
    if (!original) original = await runGit(cwd, ['show', `HEAD:${filePath}`]);
    try { modified = readFileSync(abs, 'utf8'); } catch { modified = ''; }
  }

  let mtime = 0;
  try { mtime = statSync(abs).mtimeMs; } catch { /* file may not exist on disk */ }

  return { original, modified, mtime };
}

function runGit(cwd, args) {
  return new Promise((resolve) => {
    if (!existsSync(cwd)) {
      resolve('');
      return;
    }
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) console.log(`[git] ${args[0]} exit ${err.code}: ${stderr?.trim()}`);
      resolve(stdout || '');
    });
  });
}

function runGitResult(cwd, args) {
  return new Promise((resolve) => {
    if (!existsSync(cwd)) {
      resolve({ ok: false, stdout: '', stderr: 'repository not found' });
      return;
    }
    console.log(`[git] ${args.join(' ')} (cwd: ${cwd})`);
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const result = { ok: !err, stdout: stdout || '', stderr: stderr || '' };
      if (err) console.log(`[git] exit ${err.code}: ${stderr?.trim()}`);
      else if (stdout?.trim()) console.log(`[git] ok: ${stdout.trim().slice(0, 200)}`);
      resolve(result);
    });
  });
}

function encodeFileId(path) {
  return Buffer.from(path).toString('base64url');
}

function decodeFileId(id) {
  return Buffer.from(id, 'base64url').toString('utf8');
}

async function getGitChanges(id) {
  const cwd = gitDir(id);
  const [statusOut, stagedNumstat, unstagedNumstat] = await Promise.all([
    runGit(cwd, ['status', '--porcelain=v1', '-z']),
    runGit(cwd, ['diff', '--cached', '--numstat', '-z']),
    runGit(cwd, ['diff', '--numstat', '-z']),
  ]);

  if (!statusOut) return [];

  // Parse --numstat -z: "additions\tdeletions\tpath\0" repeated
  function parseNumstat(raw) {
    const map = {};
    if (!raw) return map;
    for (const entry of raw.split('\0').filter(Boolean)) {
      const parts = entry.split('\t');
      if (parts.length < 3) continue;
      map[parts[2]] = { additions: parseInt(parts[0], 10) || 0, deletions: parseInt(parts[1], 10) || 0 };
    }
    return map;
  }

  const stagedCounts = parseNumstat(stagedNumstat);
  const unstagedCounts = parseNumstat(unstagedNumstat);

  // Parse porcelain -z: "XY path\0" (or "XY orig\0path\0" for renames)
  const files = [];
  const entries = statusOut.split('\0').filter(Boolean);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.length < 3) continue;
    const X = entry[0];
    const Y = entry[1];
    let path = entry.slice(3);

    // Renames/copies have orig path as next null-delimited entry
    if ((X === 'R' || X === 'C') && i + 1 < entries.length) {
      i++;
      path = entries[i]; // new path
    }

    const staged = X !== ' ' && X !== '?';
    const statusChar = staged ? X : Y;

    const counts = staged
      ? (stagedCounts[path] || unstagedCounts[path] || { additions: 0, deletions: 0 })
      : (unstagedCounts[path] || { additions: 0, deletions: 0 });

    files.push({
      id: encodeFileId(path),
      path,
      status: statusChar === '?' ? '?' : statusChar,
      staged,
      additions: counts.additions,
      deletions: counts.deletions,
    });
  }

  return files;
}

async function countGitChanges(id) {
  const cwd = gitDir(id);
  const out = await runGit(cwd, ['status', '--porcelain=v1']);
  return out ? out.split('\n').filter(l => l.trim()).length : 0;
}

export async function getRemoteStatus(id) {
  const cwd = gitDir(id);
  const tracking = await runGitResult(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);

  // A freshly created workstream branch has no upstream until its first push.
  // Report that state (rather than null) so the UI can offer "Publish" instead
  // of hiding the sync affordance entirely. Ahead is measured against the
  // remote-tracking ref the branch was forked from, when it still resolves.
  if (!tracking.ok) {
    if (!(await hasRemote(cwd))) return null;
    const base = await forkPoint(cwd);
    const ahead = base
      ? parseInt((await runGitResult(cwd, ['rev-list', '--count', `${base}..HEAD`])).stdout.trim(), 10) || 0
      : 0;
    return { remote: null, hasUpstream: false, ahead, behind: 0 };
  }

  const [aheadRes, behindRes] = await Promise.all([
    runGitResult(cwd, ['rev-list', '--count', '@{u}..HEAD']),
    runGitResult(cwd, ['rev-list', '--count', 'HEAD..@{u}']),
  ]);
  return {
    remote: tracking.stdout.trim(),
    hasUpstream: true,
    ahead: parseInt(aheadRes.stdout.trim(), 10) || 0,
    behind: parseInt(behindRes.stdout.trim(), 10) || 0,
  };
}

// True when the repo has an `origin` remote to push to.
async function hasRemote(cwd) {
  const res = await runGitResult(cwd, ['remote', 'get-url', 'origin']);
  return res.ok && !!res.stdout.trim();
}

// What deleting a project/workstream would destroy for good: commits that are
// reachable from HEAD but from no remote-tracking ref, plus uncommitted
// working-tree changes. `--not --remotes` covers both the published branch that
// is merely ahead of its upstream and the workstream branch that was never
// pushed at all. With no remotes configured nothing is safe, so every commit
// counts — `hasRemote` lets the UI say so rather than implying a failed push.
export async function getDeletionImpact(id) {
  const p = projects.find(p => p.id === id);
  if (!p) return null;
  const cwd = gitDir(id);
  if (!existsSync(cwd)) {
    return { commits: 0, subjects: [], uncommittedFiles: 0, hasRemote: false, branch: p.branch };
  }

  const remote = await hasRemote(cwd);
  const [log, changes] = await Promise.all([
    runGitResult(cwd, ['log', '--format=%s', '--max-count=5', 'HEAD', '--not', '--remotes']),
    countGitChanges(id),
  ]);
  const subjects = log.ok ? log.stdout.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const countRes = log.ok
    ? await runGitResult(cwd, ['rev-list', '--count', 'HEAD', '--not', '--remotes'])
    : { ok: false, stdout: '' };

  return {
    commits: countRes.ok ? parseInt(countRes.stdout.trim(), 10) || 0 : 0,
    subjects,
    uncommittedFiles: changes,
    hasRemote: remote,
    branch: p.branch,
  };
}

// Best-effort base for an unpublished branch: the remote-tracking ref it was
// branched from. Returns null when nothing usable resolves.
async function forkPoint(cwd) {
  const head = await runGitResult(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const candidates = [];
  const headName = head.stdout.trim();
  if (headName && headName !== 'HEAD') candidates.push(`origin/${headName}`);
  candidates.push('origin/HEAD');
  for (const ref of candidates) {
    const res = await runGitResult(cwd, ['rev-parse', '--verify', '--quiet', ref]);
    if (res.ok && res.stdout.trim()) return ref;
  }
  return null;
}

export async function syncProject(id) {
  const p = projects.find(p => p.id === id);
  if (!p) return null;
  const cwd = gitDir(id);

  const tracking = await runGitResult(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!tracking.ok) {
    // Unpublished branch (a fresh workstream): there is nothing to rebase onto,
    // so publish it and set up tracking in one step.
    if (!(await hasRemote(cwd))) return { ok: false, error: 'no remote tracking branch configured' };
    const pushRes = await runGitResult(cwd, ['push', '-u', 'origin', 'HEAD']);
    if (!pushRes.ok) return { ok: false, error: pushRes.stderr.trim() || 'push failed' };
    return { ok: true };
  }

  await runGitResult(cwd, ['fetch']);

  const behindRes = await runGitResult(cwd, ['rev-list', '--count', 'HEAD..@{u}']);
  const behind = parseInt(behindRes.stdout.trim(), 10) || 0;

  if (behind > 0) {
    const rebaseRes = await runGitResult(cwd, ['rebase', '@{u}']);
    if (!rebaseRes.ok) return { ok: false, error: rebaseRes.stderr.trim() || 'rebase failed' };
  }

  const aheadRes = await runGitResult(cwd, ['rev-list', '--count', '@{u}..HEAD']);
  const ahead = parseInt(aheadRes.stdout.trim(), 10) || 0;

  if (ahead > 0) {
    const pushRes = await runGitResult(cwd, ['push']);
    if (!pushRes.ok) return { ok: false, error: pushRes.stderr.trim() || 'push failed' };
  }

  return { ok: true };
}

export function cloneRepo(id, repoUrl) {
  const dataDir = `/data/${id}`;
  const destDir = gitDir(id);
  mkdirSync(dataDir, { recursive: true });
  projectStatus[id] = 'cloning';
  delete projectErrors[id];
  // Clone the clean URL; credentials are supplied on demand by the git
  // credential helper (git-credential-broker.js) so no token is baked in.
  console.log(`[clone] ${id}: cloning ${repoUrl} -> ${destDir}`);

  const proc = spawn('git', ['clone', repoUrl, destDir]);

  // Capture git's progress/error output so a failed clone isn't silent.
  let stderr = '';
  proc.stderr?.on('data', d => { stderr += d.toString(); });

  const fail = (message) => {
    console.error(`[clone] ${id}: ${message}`);
    projectStatus[id] = 'error';
    projectErrors[id] = message;
  };

  // spawn() itself can fail (e.g. git not on PATH); without this the error is
  // unhandled and the project is left stuck in 'cloning' with no log line.
  proc.on('error', (err) => fail(`failed to spawn git: ${err.message}`));

  proc.on('close', (code) => {
    if (code === 0) {
      // Files must be owned by whoever runs podman so the inner container's root maps correctly
      const owner = `${process.getuid()}:${process.getgid()}`;
      execFile('chown', ['-R', owner, dataDir], (err) => {
        if (err) {
          fail(`chown failed: ${err.message}`);
          return;
        }
        console.log(`[clone] ${id}: done`);
        projectStatus[id] = 'idle';
        delete projectErrors[id];
        const project = projects.find(p => p.id === id);
        if (project) {
          project.lastActivity = new Date().toISOString();
          persist();
        }
      });
    } else {
      // Surface the tail of git's stderr — it carries the actionable reason
      // (auth failure, repo not found, etc.) — while keeping the message short.
      const reason = stderr.trim().split('\n').filter(Boolean).pop() || `git exited with code ${code}`;
      fail(`git clone failed: ${reason}`);
    }
  });
}

// Parse a "start-end" port range string into [start, end], falling back to the
// default range when the value is missing or malformed.
function parsePortRange(range) {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(range || '');
  if (!m) return [22000, 23000];
  const start = parseInt(m[1], 10);
  const end = parseInt(m[2], 10);
  if (end < start) return [22000, 23000];
  return [start, end];
}

// Hand out the next port within the configured range, advancing (and wrapping)
// the cursor persisted in the config so each project gets a distinct port.
// Ports already assigned to a project are skipped so a wrapped cursor doesn't
// hand out a duplicate.
function allocatePort() {
  const [start, end] = parsePortRange(config.portRange);
  const taken = new Set(projects.map(p => p.port).filter(Boolean));
  let port = config.nextPort;
  if (typeof port !== 'number' || port < start || port > end) port = start;
  for (let i = 0; i <= end - start && taken.has(port); i++) {
    port = port + 1 > end ? start : port + 1;
  }
  config.nextPort = port + 1 > end ? start : port + 1;
  persist();
  return port;
}

// Host ports handed out to workstreams for the lifetime of this process. These
// are deliberately not persisted: a workstream's port only has to be stable
// while it is running, and starting from the top of the range keeps it clear of
// the per-project ports allocated from the bottom.
const workstreamPorts = new Map();

// The HOST_PORT a project's compose stack should publish on.
//
// - Default workstream (a plain project): the port assigned to the project,
//   persisted so it stays stable across restarts. Assigned lazily so projects
//   created before ports existed — and projects cloned from a repo — get one.
// - Named workstream: a dynamic port taken from the *top* of the range, held in
//   memory for as long as the process lives so restarts reuse it.
export function getHostPort(id) {
  const project = projects.find(p => p.id === id);
  if (!project) return null;

  if (!project.parentId) {
    if (!project.port) {
      project.port = allocatePort();
      persist();
    }
    return project.port;
  }

  const existing = workstreamPorts.get(id);
  if (existing) return existing;

  const [start, end] = parsePortRange(config.portRange);
  const taken = new Set([
    ...projects.map(p => p.port).filter(Boolean),
    ...workstreamPorts.values(),
  ]);
  let port = end;
  while (port >= start && taken.has(port)) port--;
  if (port < start) port = end; // range exhausted — reuse and let compose complain
  workstreamPorts.set(id, port);
  return port;
}

// Environment for any `podman compose` invocation on a project. Project compose
// files publish on `${HOST_PORT}`, and compose interpolates the file on
// `down`/`ps`/`logs` too, so every invocation must see the same value as the
// `up` that started the stack.
export function composeEnv(id) {
  return { ...process.env, HOST_PORT: String(getHostPort(id) ?? '') };
}

// Initialize a fresh project (no repo to clone): create the git directory,
// write the template's CLAUDE.md, run `git init`, and fix ownership so the
// inner container's root maps correctly.
export function initProject(id, template) {
  const dataDir = `/data/${id}`;
  const destDir = gitDir(id);
  mkdirSync(destDir, { recursive: true });

  const claudeMd = getTemplateClaudeMd(template);
  if (claudeMd) {
    writeFileSync(join(destDir, 'CLAUDE.md'), claudeMd, 'utf8');
  }

  execFile('git', ['init'], { cwd: destDir }, (err) => {
    if (err) {
      console.log(`[git] init failed for ${id}: ${err.message}`);
      projectStatus[id] = 'error';
      return;
    }
    const owner = `${process.getuid()}:${process.getgid()}`;
    execFile('chown', ['-R', owner, dataDir], () => {});
  });
}

export async function getProjects() {
  const counts = await Promise.all(projects.map(p => countGitChanges(p.id)));
  return projects.map((p, i) => ({
    ...p,
    status: projectStatus[p.id] ?? 'idle',
    statusError: projectErrors[p.id],
    changes: counts[i],
    hasCompose: getHasCompose(p.id),
  }));
}

export async function getProject(id) {
  const p = projects.find(p => p.id === id);
  if (!p) return null;
  const changes = await countGitChanges(id);
  return {
    ...p,
    status: projectStatus[p.id] ?? 'idle',
    statusError: projectErrors[p.id],
    changes,
    hasCompose: getHasCompose(id),
  };
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createProject(data) {
  const id = slugify(data.name) || 'project';
  if (projects.some(p => p.id === id)) {
    return { error: 'a project with this name already exists' };
  }
  const project = {
    id,
    name: data.name,
    repo: data.repo || '',
    description: '',
    branch: data.branch || 'main',
    template: data.template || 'blank',
    // Stable host port for the default workstream's compose stack, passed in as
    // HOST_PORT when the project runs.
    port: allocatePort(),
    lastActivity: new Date().toISOString(),
  };
  projects.push(project);
  projectStatus[id] = 'idle';
  persist();
  return { ...project, status: 'idle', changes: 0 };
}

// --- Workstreams -----------------------------------------------------------
//
// A workstream is an isolated copy of a project's repo (own working tree, own
// branch, own agent/shell sandbox, own compose stack). It is stored as an
// ordinary project row carrying `parentId` + `workstream`, with the composite
// id `<parentId>--<workstream>`. Because slugify() collapses runs of '-', no
// plain project id can ever contain '--', so the composite is unambiguous —
// and every subsystem keyed on a project id (repo path, terminal sessions,
// watchers, log capture, compose project name, LOOP_PROJECT_ID) isolates
// workstreams for free, with no changes.

const WORKSTREAM_SEPARATOR = '--';

function workstreamId(parentId, slug) {
  return `${parentId}${WORKSTREAM_SEPARATOR}${slug}`;
}

// Every workstream belonging to a project, newest last, excluding the default.
function childrenOf(parentId) {
  return projects.filter(p => p.parentId === parentId);
}

// The workstream switcher's data: the default checkout first, then each
// workstream. `workstream` is null for the default.
export function listWorkstreams(parentId) {
  const parent = projects.find(p => p.id === parentId && !p.parentId);
  if (!parent) return null;
  const entry = (p, slug) => ({
    id: p.id,
    workstream: slug,
    branch: p.branch,
    status: projectStatus[p.id] ?? 'idle',
  });
  return [entry(parent, null), ...childrenOf(parentId).map(p => entry(p, p.workstream))];
}

// Create a workstream: register the row, then in the background clone the
// parent's checkout locally (fast, and it carries commits the parent hasn't
// pushed yet), repoint origin at the upstream, and branch off it.
export function createWorkstream(parentId, name) {
  const parent = projects.find(p => p.id === parentId);
  if (!parent) return { error: 'not found', code: 404 };
  if (parent.parentId) return { error: 'workstreams cannot be nested', code: 400 };
  if (!parent.repo) return { error: 'workstreams require an upstream repository', code: 400 };

  const slug = slugify(name || '');
  if (!slug) return { error: 'a valid workstream name is required', code: 400 };

  const id = workstreamId(parentId, slug);
  if (projects.some(p => p.id === id)) {
    return { error: 'a workstream with this name already exists', code: 409 };
  }

  const parentGit = gitDir(parentId);
  if (!existsSync(parentGit)) {
    return { error: 'the project repository is not available yet', code: 409 };
  }

  const workstream = {
    id,
    name: parent.name,
    parentId,
    workstream: slug,
    repo: parent.repo,
    description: '',
    branch: slug,
    template: parent.template,
    lastActivity: new Date().toISOString(),
  };
  projects.push(workstream);
  projectStatus[id] = 'cloning';
  delete projectErrors[id];
  persist();

  setupWorkstreamRepo(id, parentGit, parent.repo, parent.branch, slug);

  return { ...workstream, status: 'cloning', changes: 0 };
}

function setupWorkstreamRepo(id, parentGit, repoUrl, baseBranch, slug) {
  const dataDir = `/data/${id}`;
  const destDir = gitDir(id);
  mkdirSync(dataDir, { recursive: true });

  const fail = (message) => {
    console.error(`[workstream] ${id}: ${message}`);
    projectStatus[id] = 'error';
    projectErrors[id] = message;
  };

  console.log(`[workstream] ${id}: cloning ${parentGit} -> ${destDir}`);

  const step = (args, cwd) => new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stderr: (stderr || err?.message || '').trim() });
    });
  });

  (async () => {
    const clone = await step(['clone', parentGit, destDir], '/data');
    if (!clone.ok) {
      fail(`git clone failed: ${clone.stderr.split('\n').filter(Boolean).pop() || 'unknown error'}`);
      return;
    }

    // Point at the real upstream so this workstream pushes independently, then
    // fetch so origin/* refs describe the upstream rather than the parent copy.
    const setUrl = await step(['remote', 'set-url', 'origin', repoUrl], destDir);
    if (!setUrl.ok) {
      fail(`git remote set-url failed: ${setUrl.stderr}`);
      return;
    }
    const fetched = await step(['fetch', 'origin'], destDir);
    if (!fetched.ok) console.warn(`[workstream] ${id}: fetch failed (continuing): ${fetched.stderr}`);

    // Branch off the upstream base branch when it resolves; otherwise off
    // whatever the parent had checked out. --no-track matters: without it git
    // would set the new branch's upstream to origin/<baseBranch>, and a later
    // `git push` would refuse because the names don't match. Leaving it
    // unpublished lets syncProject() do `push -u origin HEAD` instead.
    let branched = await step(['checkout', '-b', slug, '--no-track', `origin/${baseBranch}`], destDir);
    if (!branched.ok) branched = await step(['checkout', '-b', slug], destDir);
    if (!branched.ok) {
      fail(`git checkout -b ${slug} failed: ${branched.stderr}`);
      return;
    }

    // Files must be owned by whoever runs podman so the inner container's root maps correctly
    const owner = `${process.getuid()}:${process.getgid()}`;
    execFile('chown', ['-R', owner, dataDir], (err) => {
      if (err) {
        fail(`chown failed: ${err.message}`);
        return;
      }
      console.log(`[workstream] ${id}: ready on branch ${slug}`);
      projectStatus[id] = 'idle';
      delete projectErrors[id];
      const p = projects.find(p => p.id === id);
      if (p) {
        p.lastActivity = new Date().toISOString();
        persist();
      }
    });
  })();
}

// Remove a project: drop it from the list and delete its data directory
// (repo + git working tree). Deleting a project also removes its workstreams.
// Live sessions/compose/watchers are torn down by the caller in server.js
// before this runs. Returns null if no such project.
export function deleteProject(id) {
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const ids = [id, ...childrenOf(id).map(p => p.id)];
  projects = projects.filter(p => !ids.includes(p.id));
  for (const target of ids) {
    delete projectStatus[target];
    delete projectErrors[target];
    workstreamPorts.delete(target);
  }
  persist();
  for (const target of ids) {
    try {
      rmSync(`/data/${target}`, { recursive: true, force: true });
    } catch (err) {
      console.error(`[delete] ${target}: failed to remove data dir: ${err.message}`);
    }
    console.log(`[delete] ${target}: removed`);
  }
  return { ok: true };
}

// Ids of a project's workstreams — used by server.js to tear down their live
// sessions/containers before the project itself is deleted.
export function getWorkstreamIds(parentId) {
  return childrenOf(parentId).map(p => p.id);
}

export async function getChanges(id) {
  const p = projects.find(p => p.id === id);
  if (!p) return null;
  return getGitChanges(id);
}

export async function commitChanges(id, { message }) {
  const project = projects.find(p => p.id === id);
  if (!project) return null;
  const cwd = gitDir(id);

  const identityArgs = [];
  if (config.gitName) identityArgs.push('-c', `user.name=${config.gitName}`);
  if (config.gitEmail) identityArgs.push('-c', `user.email=${config.gitEmail}`);
  const result = await runGitResult(cwd, [...identityArgs, 'commit', '-m', message]);
  if (!result.ok) {
    const err = result.stderr.trim() || result.stdout.trim() || 'commit failed';
    console.log(`[git] commit failed: ${err}`);
    return { ok: false, error: err };
  }

  project.lastActivity = new Date().toISOString();
  persist();
  return { ok: true, branch: project.branch };
}

export async function stageAll(id) {
  const p = projects.find(p => p.id === id);
  if (!p) return null;
  const cwd = gitDir(id);
  await runGit(cwd, ['add', '-A']);
  return getGitChanges(id);
}

const BINARY_EXTENSIONS = new Set([
  'png','jpg','jpeg','gif','webp','svg','bmp','ico','avif',
  'pdf','zip','tar','gz','bz2','7z','rar',
  'mp3','mp4','wav','ogg','flac','avi','mov','mkv',
  'woff','woff2','ttf','eot','otf',
  'exe','dll','so','bin','pyc',
  'lock',
]);

function isBinaryPath(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return BINARY_EXTENSIONS.has(ext);
}

function collectFiles(dirPath, baseDir, depth = 0) {
  if (depth >= 6) return [];
  let entries;
  try { entries = readdirSync(dirPath, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...collectFiles(join(dirPath, entry.name), baseDir, depth + 1));
      }
    } else {
      const abs = join(dirPath, entry.name);
      if (!isBinaryPath(entry.name)) files.push(abs);
    }
  }
  return files;
}

export function searchFiles(id, query, caseSensitive = false, maxMatches = 100) {
  const base = gitDir(id);
  if (!existsSync(base)) return null;
  const files = collectFiles(base, base);
  const results = [];
  let total = 0;
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  for (const absPath of files) {
    if (total >= maxMatches) break;
    let content;
    try { content = readFileSync(absPath, 'utf8'); } catch { continue; }
    const lines = content.split('\n');
    const filePath = relative(base, absPath);
    const matches = [];
    for (let i = 0; i < lines.length && total < maxMatches; i++) {
      const line = lines[i];
      const haystack = caseSensitive ? line : line.toLowerCase();
      let pos = haystack.indexOf(searchQuery);
      if (pos !== -1) {
        matches.push({ line: i + 1, text: line, matchStart: pos, matchEnd: pos + searchQuery.length });
        total++;
        // Only record first match per line (one entry per occurrence would bloat results)
      }
    }
    if (matches.length > 0) results.push({ file: filePath, matches });
  }
  return { results, total };
}

export function setProjectStatus(id, status) {
  const project = projects.find(p => p.id === id);
  if (!project) return null;
  projectStatus[id] = status;
  return { status };
}

export function getProjectStatus(id) {
  return projectStatus[id] || 'idle';
}

export function getHasCompose(id) {
  const repoPath = `/data/${id}/git`;
  return ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']
    .some(f => existsSync(join(repoPath, f)));
}

function applyGitAuthor(name, email) {
  const ops = [];
  if (name) ops.push(new Promise(resolve =>
    execFile('git', ['config', '--global', 'user.name', name], (err) => {
      if (err) console.log(`[git] failed to set user.name globally: ${err.message}`);
      resolve();
    })
  ));
  if (email) ops.push(new Promise(resolve =>
    execFile('git', ['config', '--global', 'user.email', email], (err) => {
      if (err) console.log(`[git] failed to set user.email globally: ${err.message}`);
      resolve();
    })
  ));
  if (ops.length) {
    console.log(`[git] applying global identity: "${name}" <${email}>`);
    Promise.all(ops);
  }
}

// Apply saved identity on startup
if (config.gitName || config.gitEmail) applyGitAuthor(config.gitName, config.gitEmail);

export function getConfig() {
  const { githubPat: _, ...rest } = config;
  return rest;
}

// The effective IANA zone for the sandbox containers. An empty/unset value
// falls back to the default rather than leaving TZ blank (which would be UTC).
export function getTimezone() {
  return config.timezone || DEFAULT_TIMEZONE;
}

export function updateConfig(updates) {
  const allowed = ['terminalMode', 'gitName', 'gitEmail', 'portRange', 'timezone'];
  const prev = { gitName: config.gitName, gitEmail: config.gitEmail, portRange: config.portRange };
  for (const key of allowed) {
    if (updates[key] !== undefined) config[key] = updates[key];
  }
  // When the range changes, restart the port cursor at the new range's start
  // and drop the dynamic workstream ports so they are re-taken from the new
  // range's top the next time each workstream runs.
  if (config.portRange !== prev.portRange) {
    config.nextPort = parsePortRange(config.portRange)[0];
    workstreamPorts.clear();
  }
  persist();
  if (config.gitName !== prev.gitName || config.gitEmail !== prev.gitEmail) {
    applyGitAuthor(config.gitName, config.gitEmail);
  }
  return getConfig();
}

export function setGithubPat(pat) {
  config.githubPat = pat || '';
  setStoredPat(config.githubPat);
  persist();
}

export function uploadFiles(id, dir, files) {
  const base = gitDir(id);
  if (!existsSync(base)) return null;
  const targetDir = dir ? resolve(base, normalize(dir)) : base;
  if (!targetDir.startsWith(base + '/') && targetDir !== base) return { error: 'invalid directory' };
  const results = [];
  for (const { name, content } of files) {
    const safeName = basename(name);
    if (!safeName || safeName === '.' || safeName === '..') {
      results.push({ name, ok: false, error: 'invalid filename' });
      continue;
    }
    const filePath = join(targetDir, safeName);
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, Buffer.from(content, 'base64'));
      results.push({ name: safeName, ok: true });
    } catch (e) {
      results.push({ name: safeName, ok: false, error: e.message });
    }
  }
  return { ok: true, results };
}

export function createFolder(id, dirPath) {
  const base = gitDir(id);
  if (!existsSync(base)) return null;
  const abs = resolve(base, normalize(dirPath));
  if (!abs.startsWith(base + '/') && abs !== base) return { error: 'invalid path' };
  try {
    mkdirSync(abs, { recursive: true });
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

export function createFile(id, filePath) {
  const base = gitDir(id);
  if (!existsSync(base)) return null;
  const abs = resolve(base, normalize(filePath));
  if (!abs.startsWith(base + '/')) return { error: 'invalid path' };
  if (existsSync(abs)) return { error: 'already exists' };
  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, '', 'utf8');
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

export function renameItem(id, oldPath, newPath) {
  const base = gitDir(id);
  if (!existsSync(base)) return null;
  const absOld = resolve(base, normalize(oldPath));
  const absNew = resolve(base, normalize(newPath));
  if (!absOld.startsWith(base + '/') && absOld !== base) return { error: 'invalid path' };
  if (!absNew.startsWith(base + '/') && absNew !== base) return { error: 'invalid path' };
  // renameSync silently clobbers an existing target — refuse instead.
  if (absNew !== absOld && existsSync(absNew)) return { error: 'already exists' };
  try {
    renameSync(absOld, absNew);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

export function deleteItem(id, itemPath) {
  const base = gitDir(id);
  if (!existsSync(base)) return null;
  const abs = resolve(base, normalize(itemPath));
  if (!abs.startsWith(base + '/') && abs !== base) return { error: 'invalid path' };
  try {
    rmSync(abs, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

export async function revertFile(id, fileId) {
  const p = projects.find(p => p.id === id);
  if (!p) return null;

  const filePath = decodeFileId(fileId);
  const cwd = gitDir(id);

  const statusOut = await runGit(cwd, ['status', '--porcelain=v1', '-z', '--', filePath]);
  const entry = statusOut ? statusOut.split('\0')[0] : '';
  if (!entry) return { ok: true };

  const X = entry[0];
  const Y = entry[1];
  const isUntracked = X === '?' && Y === '?';
  const isStaged = X !== ' ' && X !== '?';

  if (isUntracked) {
    const abs = resolve(cwd, normalize(filePath));
    if (!abs.startsWith(cwd + '/') && abs !== cwd) return { error: 'invalid path' };
    rmSync(abs, { recursive: true, force: true });
  } else {
    if (isStaged) {
      await runGit(cwd, ['restore', '--staged', '--', filePath]);
    }
    await runGit(cwd, ['restore', '--', filePath]);
  }

  return { ok: true };
}

export async function toggleStage(id, fileId) {
  const p = projects.find(p => p.id === id);
  if (!p) return null;

  const filePath = decodeFileId(fileId);
  const cwd = gitDir(id);

  // Determine current state
  const statusOut = await runGit(cwd, ['status', '--porcelain=v1', '-z', '--', filePath]);
  const entry = statusOut ? statusOut.split('\0')[0] : '';
  const X = entry ? entry[0] : ' ';
  const Y = entry ? entry[1] : ' ';
  const currentlyStaged = X !== ' ' && X !== '?';

  if (currentlyStaged) {
    // Unstage: use git restore --staged, fall back to git reset for older git
    await runGit(cwd, ['restore', '--staged', '--', filePath]);
  } else {
    await runGit(cwd, ['add', '--', filePath]);
  }

  // Return updated file state
  const statusOut2 = await runGit(cwd, ['status', '--porcelain=v1', '-z', '--', filePath]);
  const entry2 = statusOut2 ? statusOut2.split('\0')[0] : '';
  const X2 = entry2 ? entry2[0] : ' ';
  const Y2 = entry2 ? entry2[1] : ' ';
  const nowStaged = X2 !== ' ' && X2 !== '?';
  const statusChar = nowStaged ? X2 : Y2;

  return {
    id: fileId,
    path: filePath,
    status: statusChar === '?' ? '?' : statusChar,
    staged: nowStaged,
    additions: 0,
    deletions: 0,
  };
}
