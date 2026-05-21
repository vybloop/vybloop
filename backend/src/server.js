import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  getProjects,
  getProject,
  createProject,
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Loop server running on port ${PORT}`);
});
