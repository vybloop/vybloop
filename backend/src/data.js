import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, renameSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, normalize, basename, relative } from 'path';
import { spawn, execFile } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '../../data/projects.json');

export const TEMPLATES = [
  { id: 'blank', name: 'Blank workspace' },
  { id: 'nextjs-tailwind', name: 'Next.js + Tailwind' },
  { id: 'vite-react', name: 'Vite + React' },
  { id: 'sveltekit', name: 'SvelteKit' },
  { id: 'astro', name: 'Astro' },
  { id: 'remix', name: 'Remix' },
  { id: 'rust-cli', name: 'Rust CLI (clap)' },
  { id: 'fastapi-postgres', name: 'FastAPI + Postgres' },
  { id: 'expo', name: 'Expo (React Native)' },
];

const DEFAULT_DB = { nextId: 1, projects: [], config: { terminalMode: 'direct', gitName: '', gitEmail: '' } };
const DEFAULT_CONFIG = { terminalMode: 'direct', gitName: '', gitEmail: '' };

function load() {
  try {
    const raw = readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_DB };
    return {
      nextId: parsed.nextId ?? 1,
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
let nextId = db.nextId;
let config = db.config;

const projectStatus = {};
for (const p of projects) {
  projectStatus[p.id] = 'idle';
}

function persist() {
  db.projects = projects;
  db.nextId = nextId;
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
  if (!tracking.ok) return null;
  const [aheadRes, behindRes] = await Promise.all([
    runGitResult(cwd, ['rev-list', '--count', '@{u}..HEAD']),
    runGitResult(cwd, ['rev-list', '--count', 'HEAD..@{u}']),
  ]);
  return {
    remote: tracking.stdout.trim(),
    ahead: parseInt(aheadRes.stdout.trim(), 10) || 0,
    behind: parseInt(behindRes.stdout.trim(), 10) || 0,
  };
}

export async function syncProject(id) {
  const p = projects.find(p => p.id === id);
  if (!p) return null;
  const cwd = gitDir(id);

  const tracking = await runGitResult(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!tracking.ok) return { ok: false, error: 'no remote tracking branch configured' };

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

function injectGithubToken(repoUrl) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return repoUrl;
  try {
    const u = new URL(repoUrl);
    if (u.hostname === 'github.com' && u.protocol === 'https:') {
      u.username = token;
      return u.toString();
    }
  } catch {}
  return repoUrl;
}

export function cloneRepo(id, repoUrl) {
  const cloneUrl = injectGithubToken(repoUrl);
  const dataDir = `/data/${id}`;
  const destDir = gitDir(id);
  mkdirSync(dataDir, { recursive: true });
  projectStatus[id] = 'cloning';

  const proc = spawn('git', ['clone', cloneUrl, destDir]);
  proc.on('close', (code) => {
    if (code === 0) {
      // Files must be owned by whoever runs podman so the inner container's root maps correctly
      const owner = `${process.getuid()}:${process.getgid()}`;
      execFile('chown', ['-R', owner, dataDir], () => {
        projectStatus[id] = 'idle';
        const project = projects.find(p => p.id === id);
        if (project) {
          project.lastActivity = new Date().toISOString();
          persist();
        }
      });
    } else {
      projectStatus[id] = 'error';
    }
  });
}

export async function getProjects() {
  const counts = await Promise.all(projects.map(p => countGitChanges(p.id)));
  return projects.map((p, i) => ({
    ...p,
    status: projectStatus[p.id] ?? 'idle',
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
    changes,
    hasCompose: getHasCompose(id),
  };
}

export function createProject(data) {
  const id = data.name.toLowerCase().replace(/[^a-z0-9-]/g, '-') + '-' + (nextId++);
  const project = {
    id,
    name: data.name,
    repo: data.repo || '',
    description: '',
    branch: data.branch || 'main',
    template: data.template || 'blank',
    lastActivity: new Date().toISOString(),
  };
  projects.push(project);
  projectStatus[id] = 'idle';
  persist();
  return { ...project, status: 'idle', changes: 0 };
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

  const result = await runGitResult(cwd, ['commit', '-m', message]);
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

export function getHasCompose(id) {
  const repoPath = `/data/${id}/git`;
  return ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']
    .some(f => existsSync(join(repoPath, f)));
}

function applyGitAuthor(name, email) {
  const ops = [];
  if (name) ops.push(new Promise(resolve =>
    execFile('git', ['config', '--global', 'user.name', name], resolve)
  ));
  if (email) ops.push(new Promise(resolve =>
    execFile('git', ['config', '--global', 'user.email', email], resolve)
  ));
  if (ops.length) {
    console.log(`[git] applying global identity: "${name}" <${email}>`);
    Promise.all(ops);
  }
}

// Apply saved identity on startup
if (config.gitName || config.gitEmail) applyGitAuthor(config.gitName, config.gitEmail);

export function getConfig() {
  return { ...config };
}

export function updateConfig(updates) {
  const allowed = ['terminalMode', 'gitName', 'gitEmail'];
  const prev = { gitName: config.gitName, gitEmail: config.gitEmail };
  for (const key of allowed) {
    if (updates[key] !== undefined) config[key] = updates[key];
  }
  persist();
  if (config.gitName !== prev.gitName || config.gitEmail !== prev.gitEmail) {
    applyGitAuthor(config.gitName, config.gitEmail);
  }
  return { ...config };
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

export function renameItem(id, oldPath, newPath) {
  const base = gitDir(id);
  if (!existsSync(base)) return null;
  const absOld = resolve(base, normalize(oldPath));
  const absNew = resolve(base, normalize(newPath));
  if (!absOld.startsWith(base + '/') && absOld !== base) return { error: 'invalid path' };
  if (!absNew.startsWith(base + '/') && absNew !== base) return { error: 'invalid path' };
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
