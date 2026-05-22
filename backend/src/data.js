import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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

const DEFAULT_DB = { nextId: 1, projects: [], config: { terminalMode: 'direct' } };
const DEFAULT_CONFIG = { terminalMode: 'direct' };

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

function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    if (!existsSync(cwd)) {
      resolve('');
      return;
    }
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      resolve(stdout || '');
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

  const out = await runGit(cwd, ['commit', '-m', message]);
  if (!out && !existsSync(cwd)) return { ok: false, error: 'repository not found' };

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

export function toggleRun(id) {
  const project = projects.find(p => p.id === id);
  if (!project) return null;
  const current = projectStatus[id] ?? 'idle';
  projectStatus[id] = current === 'running' ? 'idle' : 'running';
  return { status: projectStatus[id] };
}

export function getConfig() {
  return { ...config };
}

export function updateConfig(updates) {
  const allowed = ['terminalMode'];
  for (const key of allowed) {
    if (updates[key] !== undefined) config[key] = updates[key];
  }
  persist();
  return { ...config };
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
