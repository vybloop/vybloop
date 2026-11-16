#!/bin/bash
set -e

# Progress for the init status page (backend/src/init-server.js, started by
# app-entrypoint.sh). Everything this script prints is also appended to the log
# the page tails; the original stdout/stderr are kept on fds 3/4 and restored
# before the real server starts, so its output doesn't go through tee forever.
LOOP_INIT_DIR="${LOOP_INIT_DIR:-/tmp/loop-init}"
step() { echo "$1" > "$LOOP_INIT_DIR/status" 2>/dev/null || true; echo "[start] $1..."; }
if [ -d "$LOOP_INIT_DIR" ]; then
  exec 3>&1 4>&2
  exec > >(tee -a "$LOOP_INIT_DIR/log") 2>&1
  # If a step fails (set -e), leave the error on the status page for a minute
  # before the container exits and restarts (which resets the log).
  trap 'rc=$?; if [ $rc -ne 0 ]; then step "Startup failed (exit $rc), restarting in 60s; see the log below"; sleep 60; fi' EXIT
fi

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

step "Migrating podman storage"
podman system migrate

# Re-sync lock IDs. The graphRoot (DB + images) is persistent, but the runRoot
# and the SHM lock segment (/dev/shm/libpod_rootless_lock_*) are ephemeral and
# wiped on every restart. The DB still records each volume's lock slot, but the
# fresh SHM lock allocator starts empty — so newly created containers/pods get
# handed slots already claimed by persisted volumes, producing "deadlock due to
# lock mismatch". renumber rebuilds all lock assignments to match the DB. With
# the boltdb backend this succeeds; we no longer hide its output, and fall back
# to a full reset (images rebuild) only if it genuinely fails.
step "Renumbering podman locks"
if ! podman system renumber; then
  echo "[start] 'podman system renumber' failed; performing full system reset (images will be rebuilt)..."
  podman system reset --force 2>/dev/null || true
  podman system migrate
fi

# Clean up stale ephemeral state left by the previous run: libpod containers and
# pods (recreated on demand by the agent and by compose).
step "Cleaning up stale containers"
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
  step "Building the claude-inner sandbox image (this can take several minutes)"
  podman build -t claude-inner --label "dockerfile-hash=${DOCKERFILE_HASH}" /app/inner-container/
  echo "[start] claude-inner image ready."
fi

# Hand the port over: stop the status page server and wait until it has exited
# (its listening socket is closed by then), then start the real one. The page
# keeps polling through the brief gap and reloads once Loop answers.
step "Starting Loop"
if [ -f "$LOOP_INIT_DIR/pid" ]; then
  init_pid="$(cat "$LOOP_INIT_DIR/pid")"
  kill "$init_pid" 2>/dev/null || true
  # It's not our job (app-entrypoint.sh started it before exec'ing into this
  # script), so poll /proc; a zombie awaiting reaping counts as exited.
  for _ in $(seq 50); do
    [ -e "/proc/$init_pid" ] && ! grep -q ') Z' "/proc/$init_pid/stat" 2>/dev/null || break
    sleep 0.1
  done
  kill -9 "$init_pid" 2>/dev/null || true
fi
if [ -d "$LOOP_INIT_DIR" ]; then
  trap - EXIT
  exec 1>&3 2>&4 3>&- 4>&-
fi

exec /usr/bin/catatonit -- node /app/src/server.js
