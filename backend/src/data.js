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

let projects = [
  {
    id: 'quill',
    name: 'quill',
    repo: 'github.com/user/quill',
    description: 'Rich text editor with markdown support',
    status: 'running',
    branch: 'main',
    template: 'vite-react',
    changes: 4,
    lastActivity: '2 min ago',
  },
  {
    id: 'fern-dashboard',
    name: 'fern-dashboard',
    repo: 'github.com/user/fern-dashboard',
    description: 'Analytics dashboard with chart components',
    status: 'idle',
    branch: 'feat/charts-v2',
    template: 'nextjs-tailwind',
    changes: 12,
    lastActivity: '1 hr ago',
  },
  {
    id: 'tessera',
    name: 'tessera',
    repo: 'github.com/user/tessera',
    description: 'Mosaic UI component library',
    status: 'idle',
    branch: 'main',
    template: 'vite-react',
    changes: 0,
    lastActivity: '3 hrs ago',
  },
  {
    id: 'loom-cli',
    name: 'loom-cli',
    repo: 'github.com/user/loom-cli',
    description: 'Command-line tool for weaving data pipelines',
    status: 'error',
    branch: 'release/0.4',
    template: 'rust-cli',
    changes: 2,
    lastActivity: '5 hrs ago',
  },
  {
    id: 'figment',
    name: 'figment',
    repo: 'github.com/user/figment',
    description: 'Design token management tool',
    status: 'idle',
    branch: 'main',
    template: 'sveltekit',
    changes: 0,
    lastActivity: 'yesterday',
  },
  {
    id: 'koi-pond',
    name: 'koi-pond',
    repo: 'github.com/user/koi-pond',
    description: 'Generative art canvas experiments',
    status: 'idle',
    branch: 'main',
    template: 'blank',
    changes: 0,
    lastActivity: '2 days ago',
  },
];

// Per-project changes store
const projectChanges = {};
for (const p of projects) {
  projectChanges[p.id] = JSON.parse(JSON.stringify(SAMPLE_CHANGES));
}

let nextId = 100;

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
    changes: 0,
    lastActivity: 'just now',
  };
  projects.push(project);
  projectChanges[id] = [];
  return project;
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
  return { ok: true, branch: project.branch };
}

export function toggleRun(id) {
  const project = projects.find(p => p.id === id);
  if (!project) return null;
  project.status = project.status === 'running' ? 'idle' : 'running';
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
