import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

const SAMPLE_CHANGES = [
  {
    id: 'f1',
    path: 'src/editor/Toolbar.tsx',
    status: 'M',
    staged: true,
    additions: 14,
    deletions: 3,
  },
  {
    id: 'f2',
    path: 'src/editor/commands/insertLink.ts',
    status: 'A',
    staged: true,
    additions: 42,
    deletions: 0,
  },
  {
    id: 'f3',
    path: 'src/lib/markdown.ts',
    status: 'M',
    staged: false,
    additions: 6,
    deletions: 1,
  },
  {
    id: 'f4',
    path: 'src/styles/tokens.css',
    status: 'M',
    staged: false,
    additions: 2,
    deletions: 2,
  },
  {
    id: 'f5',
    path: 'docs/keybindings.md',
    status: 'A',
    staged: false,
    additions: 31,
    deletions: 0,
  },
  {
    id: 'f6',
    path: 'src/legacy/oldToolbar.tsx',
    status: 'D',
    staged: false,
    additions: 0,
    deletions: 88,
  },
];

function load() {
  const raw = readFileSync(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

function save(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

const db = load();
let { projects, nextId } = db;

// Per-project changes — runtime only, not persisted
const projectChanges = {};
for (const p of projects) {
  projectChanges[p.id] = JSON.parse(JSON.stringify(SAMPLE_CHANGES));
}

function persist() {
  db.projects = projects;
  db.nextId = nextId;
  save(db);
}

export function getProjects() {
  return projects.map(p => ({
    ...p,
    changes: (projectChanges[p.id] || []).length,
  }));
}

export function getProject(id) {
  const p = projects.find(p => p.id === id);
  if (!p) return null;
  return { ...p, changes: (projectChanges[p.id] || []).length };
}

export function createProject(data) {
  const id = data.name.toLowerCase().replace(/[^a-z0-9-]/g, '-') + '-' + (nextId++);
  const project = {
    id,
    name: data.name,
    repo: data.repo || '',
    description: '',
    status: 'idle',
    branch: data.branch || 'main',
    template: data.template || 'blank',
    lastActivity: new Date().toISOString(),
  };
  projects.push(project);
  projectChanges[id] = [];
  persist();
  return { ...project, changes: 0 };
}

export function getChanges(id) {
  return projectChanges[id] || [];
}

export function commitChanges(id, { message, paths }) {
  const project = projects.find(p => p.id === id);
  if (!project) return null;
  const changes = projectChanges[id] || [];
  const pathSet = new Set(paths);
  projectChanges[id] = changes.filter(f => !pathSet.has(f.path));
  project.lastActivity = new Date().toISOString();
  persist();
  return { ok: true, branch: project.branch };
}

export function toggleRun(id) {
  const project = projects.find(p => p.id === id);
  if (!project) return null;
  project.status = project.status === 'running' ? 'idle' : 'running';
  persist();
  return { status: project.status };
}

export function toggleStage(id, fileId) {
  const changes = projectChanges[id];
  if (!changes) return null;
  const file = changes.find(f => f.id === fileId);
  if (!file) return null;
  file.staged = !file.staged;
  return file;
}
