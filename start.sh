#!/bin/bash
set -e

STORAGE_ROOT="/home/poduser/.local/share/containers/storage"

# One-time migration off the sqlite libpod backend. Older deployments created a
# sqlite DB (db.sql), whose `system renumber` is broken (containers/podman#23052)
# and therefore could never fix the lock collisions below. We now use boltdb
# (see containers.conf). Removing db.sql drops only the container/pod/volume
# *objects* from the libpod state — images (c/storage) and volume *data* on disk
# are preserved — letting podman re-init cleanly on the boltdb backend.
if [ -f "$STORAGE_ROOT/db.sql" ]; then
  echo "[start] Found sqlite libpod DB; migrating to boltdb backend (images and volume data are preserved)..."
  rm -f "$STORAGE_ROOT/db.sql"
fi

podman system migrate

# Re-sync lock IDs. The graphRoot (DB + images) is persistent, but the runRoot
# and the SHM lock segment (/dev/shm/libpod_rootless_lock_*) are ephemeral and
# wiped on every restart. The DB still records each volume's lock slot, but the
# fresh SHM lock allocator starts empty — so newly created containers/pods get
# handed slots already claimed by persisted volumes, producing "deadlock due to
# lock mismatch". renumber rebuilds all lock assignments to match the DB. With
# the boltdb backend this succeeds; we no longer hide its output, and fall back
# to a full reset (images rebuild) only if it genuinely fails.
if ! podman system renumber; then
  echo "[start] 'podman system renumber' failed; performing full system reset (images will be rebuilt)..."
  podman system reset --force 2>/dev/null || true
  podman system migrate
fi

# Clean up stale ephemeral state left by the previous run: libpod containers and
# pods (recreated on demand by the agent and by compose).
podman rm --all --force 2>/dev/null || true
podman pod rm --all --force 2>/dev/null || true

# Remove c/storage containers that libpod no longer tracks. Dropping db.sql (the
# boltdb migration) and unclean shutdowns leave containers registered in
# c/storage but unknown to libpod; they squat on their old names, so compose
# fails with "the container name ... is already in use by an external entity".
# `podman rm --all` only sees libpod containers, so target the orphans directly:
# everything in the --external listing that isn't in the libpod listing. Using
# the set difference (rather than removing all external containers) protects any
# container libpod is legitimately running.
libpod_ids="$(podman ps -aq 2>/dev/null)"
for sid in $(podman ps -aq --external 2>/dev/null); do
  if ! printf '%s\n' "$libpod_ids" | grep -qx "$sid"; then
    echo "[start] Removing orphaned c/storage container $sid..."
    podman rm --storage --force "$sid" 2>/dev/null || true
  fi
done

DOCKERFILE_HASH=$(sha256sum /app/inner-container/Dockerfile | cut -d' ' -f1)
EXISTING_HASH=$(podman image inspect claude-inner --format '{{index .Labels "dockerfile-hash"}}' 2>/dev/null || true)

if [ "$EXISTING_HASH" != "$DOCKERFILE_HASH" ]; then
  echo "[start] Building claude-inner image (Dockerfile changed)..."
  podman build -t claude-inner --label "dockerfile-hash=${DOCKERFILE_HASH}" /app/inner-container/
  echo "[start] claude-inner image ready."
fi

exec /usr/bin/catatonit -- node /app/src/server.js
