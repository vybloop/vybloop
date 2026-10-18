// The sandbox layer library: reusable Dockerfile fragments ("blender", "qemu",
// …) a project enables by listing their ids in `.loop/sandbox.json`
// (`{ "use": [...] }`). sandbox-image.js layers them on the base image, in id
// order, ahead of the repo's own `.loop/sandbox.Dockerfile`.
//
// Built-in layers are defined below. User layers are stored one JSON file each
// in /data/sandbox-layers/<id>.json — made from scratch in the UI or promoted
// from a repo's fragment. A user layer whose id matches a built-in overrides it
// ("modified"); deleting that override restores the built-in.
//
// Library layers have no build context of their own (they're shared, not tied
// to a repo), so they can't COPY/ADD local files.
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

const LAYERS_DIR = '/data/sandbox-layers';
// Read by the agents (see AGENT_INSTRUCTIONS), so they can pick from the library
// instead of hand-rolling an install that already exists.
const AGENT_INDEX = '/claudeconfig/loop-sandbox-layers.json';
const LAYER_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Each RUN is self-contained (update → install → clean) so a layer works
// whichever layers come before it.
const APT = (packages) =>
  `RUN apt-get update && \\\n    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${packages} && \\\n    rm -rf /var/lib/apt/lists/*`;

const BUILTIN_LAYERS = [
  {
    id: 'build-essential',
    name: 'C/C++ toolchain',
    description: 'gcc, g++, make, CMake, Ninja and pkg-config.',
    fragment: APT('build-essential cmake ninja-build pkg-config'),
  },
  {
    id: 'python',
    name: 'Python',
    description: 'Python 3 with pip, venv and headers for building native extensions.',
    fragment: APT('python3 python3-pip python3-venv python3-dev'),
  },
  {
    id: 'go',
    name: 'Go',
    description: "Go from Ubuntu's archive.",
    fragment: APT('golang-go'),
  },
  {
    id: 'rust',
    name: 'Rust',
    description: 'Stable Rust via rustup (cargo, rustc, clippy, rustfmt), installed system-wide.',
    fragment: [
      APT('build-essential'),
      'ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH',
      'RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile default && \\\n    chmod -R a+w $RUSTUP_HOME $CARGO_HOME',
    ].join('\n'),
  },
  {
    id: 'qemu',
    name: 'QEMU / OS development',
    description: 'QEMU (x86, ARM, RISC-V), OVMF UEFI firmware, NASM, GRUB and xorriso for building bootable images.',
    fragment: APT('qemu-system-x86 qemu-system-arm qemu-system-misc qemu-utils ovmf nasm grub-pc-bin grub-common xorriso mtools'),
  },
  {
    id: 'blender',
    name: 'Blender',
    description: "Blender from Ubuntu's archive, for headless rendering and asset export (blender -b …).",
    fragment: APT('blender'),
  },
];

// Problems that make a fragment unusable as a library layer, or null.
export function layerFragmentError(fragment) {
  if (typeof fragment !== 'string' || !fragment.trim()) return 'The layer is empty.';
  if (/^\s*FROM\s/im.test(fragment)) return 'A layer must not contain FROM — it is stacked on the base sandbox image.';
  // COPY --from=<image> and ADD <url> don't need a build context; anything else does.
  if (/^\s*COPY\s+(?!.*--from)/im.test(fragment) || /^\s*ADD\s+(?:--\S+\s+)*(?!--|https?:\/\/)/im.test(fragment)) {
    return "A layer can't COPY or ADD local files — library layers have no build context.";
  }
  return null;
}

function readUserLayers() {
  if (!existsSync(LAYERS_DIR)) return [];
  const layers = [];
  for (const file of readdirSync(LAYERS_DIR)) {
    if (!file.endsWith('.json')) continue;
    try {
      const layer = JSON.parse(readFileSync(join(LAYERS_DIR, file), 'utf8'));
      if (LAYER_ID_RE.test(layer.id) && typeof layer.fragment === 'string') layers.push(layer);
    } catch (err) {
      console.error(`[sandbox-layers] skipping unreadable ${file}:`, err.message);
    }
  }
  return layers;
}

// Every layer, user overrides applied, sorted by id: { id, name, description,
// fragment, builtin, modified, updatedAt? }.
export function listLayers() {
  const byId = new Map(BUILTIN_LAYERS.map(l => [l.id, { ...l, builtin: true, modified: false }]));
  for (const l of readUserLayers()) {
    const builtin = byId.has(l.id);
    byId.set(l.id, {
      id: l.id,
      name: l.name || l.id,
      description: l.description || '',
      fragment: l.fragment,
      builtin,
      modified: builtin,
      updatedAt: l.updatedAt,
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getLayer(id) {
  return listLayers().find(l => l.id === id) || null;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

function writeLayer(id, { name, description, fragment }) {
  mkdirSync(LAYERS_DIR, { recursive: true });
  const layer = {
    id,
    name: String(name || id).trim(),
    description: String(description || '').trim(),
    fragment: `${fragment.trim()}\n`,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(join(LAYERS_DIR, `${id}.json`), `${JSON.stringify(layer, null, 2)}\n`);
  writeAgentIndex();
  return getLayer(id);
}

// Errors carry an HTTP status for server.js.
function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

// A new layer, its id derived from the name. 409 if the id is taken.
export function createLayer({ name, description, fragment }) {
  const id = slugify(String(name || ''));
  if (!id) throw fail(400, 'A layer needs a name.');
  if (getLayer(id)) throw fail(409, `A layer named "${id}" already exists.`);
  const error = layerFragmentError(fragment);
  if (error) throw fail(400, error);
  return writeLayer(id, { name, description, fragment });
}

// Edit a layer. Editing a built-in stores an override.
export function updateLayer(id, { name, description, fragment }) {
  const existing = getLayer(id);
  if (!existing) throw fail(404, 'No such layer.');
  const error = layerFragmentError(fragment);
  if (error) throw fail(400, error);
  return writeLayer(id, { name: name ?? existing.name, description: description ?? existing.description, fragment });
}

// Delete a user layer, or drop the override on a built-in (restoring it).
export function deleteLayer(id) {
  const existing = getLayer(id);
  if (!existing) throw fail(404, 'No such layer.');
  if (existing.builtin && !existing.modified) throw fail(400, "Built-in layers can't be deleted.");
  unlinkSync(join(LAYERS_DIR, `${id}.json`));
  writeAgentIndex();
}

export function isLayerId(id) {
  return typeof id === 'string' && LAYER_ID_RE.test(id);
}

export function writeAgentIndex() {
  try {
    const index = listLayers().map(({ id, name, description, fragment }) => ({ id, name, description, fragment }));
    writeFileSync(AGENT_INDEX, `${JSON.stringify(index, null, 2)}\n`);
  } catch (err) {
    console.error('[sandbox-layers] failed to write agent index:', err.message);
  }
}
