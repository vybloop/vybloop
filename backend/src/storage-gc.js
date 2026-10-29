// Periodic cleanup of the podman storage volume. Left alone it only grows: every
// `podman compose up --build` leaves the previous build behind as an untagged
// image, and deleting a project leaves its compose images and named volumes in
// place. (By 2026-10 it held ~3700 untagged images, ~40 GB.)
//
// Sandbox images (`loop-sandbox:*`) are handled separately by pruneSandboxImages()
// in sandbox-image.js. Pulled base images (node, golang, …) are kept as cache.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { AGENTS_VOLUME } from './agent-toolchain.js';

const execFileAsync = promisify(execFile);

// Only touch images and volumes that belong to a project that is gone. Callers
// must pass an isLiveProject(id) that checks more than projects.json: data.js
// falls back to an empty list when that file can't be read, which would make
// every project look deleted.
const PROJECT_ID_RE = /^[a-z0-9]+(?:-+[a-z0-9]+)*$/;

// podman-compose names a built image `<project>_<service>`. A project id is a
// slug with no `_`, so the part before the first `_` is the project id. Images
// with an explicit `image:` name in the compose file don't match and are left alone.
async function pruneDeletedProjectImages(isLiveProject) {
  const { stdout } = await execFileAsync('podman', [
    'images', '--format', '{{.Repository}}:{{.Tag}}',
  ], { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
  let removed = 0;
  for (const ref of stdout.trim().split('\n').filter(Boolean)) {
    const repo = ref.replace(/:[^:/]*$/, '');
    if (!repo.startsWith('localhost/')) continue;
    const name = repo.slice('localhost/'.length);
    const sep = name.indexOf('_');
    if (sep <= 0) continue;
    const projectId = name.slice(0, sep);
    if (!PROJECT_ID_RE.test(projectId) || isLiveProject(projectId)) continue;
    try {
      // No -f: an image a container still uses is refused and kept.
      await execFileAsync('podman', ['rmi', ref], { timeout: 120_000 });
      console.log(`[gc] removed image ${ref} (project ${projectId} deleted)`);
      removed++;
    } catch {
      // In use, or already gone. Try again next time.
    }
  }
  return removed;
}

// A compose volume of a project that no longer exists. Volumes of projects that
// still exist are never removed, even when stopped; resetting one is a user action
// (the Volumes UI). Unlabelled volumes aren't Loop's and are skipped.
async function pruneDeletedProjectVolumes(isLiveProject) {
  const { stdout } = await execFileAsync('podman', ['volume', 'ls', '--format', 'json'], {
    timeout: 60_000, maxBuffer: 10 * 1024 * 1024,
  });
  let removed = 0;
  for (const v of JSON.parse(stdout.trim() || '[]')) {
    if (v.Name === AGENTS_VOLUME) continue;
    const project = v.Labels?.['io.podman.compose.project'] || v.Labels?.['com.docker.compose.project'];
    if (!project || !PROJECT_ID_RE.test(project) || isLiveProject(project)) continue;
    try {
      // No -f: refused while any container (even a stopped one) references it.
      await execFileAsync('podman', ['volume', 'rm', v.Name], { timeout: 60_000 });
      console.log(`[gc] removed volume ${v.Name} (project ${project} deleted)`);
      removed++;
    } catch {
      // Still referenced. Try again next time.
    }
  }
  return removed;
}

// Untagged images that nothing builds on: superseded compose builds, plus any
// whose tagged child was removed above. Intermediate images that are parents
// of a tagged image are kept, so rebuilds of current projects stay cached.
async function pruneDanglingImages() {
  // The first run on a long-neglected volume can take a while.
  const { stdout } = await execFileAsync('podman', ['image', 'prune', '-f'], {
    timeout: 30 * 60_000, maxBuffer: 50 * 1024 * 1024,
  });
  return stdout.trim().split('\n').filter(Boolean).length;
}

export async function pruneProjectStorage(isLiveProject) {
  const images = await pruneDeletedProjectImages(isLiveProject);
  const volumes = await pruneDeletedProjectVolumes(isLiveProject);
  // Last, so parents freed by the rmi calls above are collected in the same pass.
  const dangling = await pruneDanglingImages();
  console.log(`[gc] removed ${images} deleted-project image(s), ${volumes} volume(s), ${dangling} dangling image(s)`);
}
