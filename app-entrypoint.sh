#!/bin/bash
set -e

# Status page while the container initializes (backend/src/init-server.js).
# Started first, before anything slow, as poduser so start.sh (also poduser) can
# stop it when handing the port over to the real server. Progress is reported
# through $LOOP_INIT_DIR/status (current step) and $LOOP_INIT_DIR/log (start.sh's
# output); /tmp survives a container restart, so reset both.
export LOOP_INIT_DIR=/tmp/loop-init
rm -rf "$LOOP_INIT_DIR"
install -d -o poduser -g poduser "$LOOP_INIT_DIR"
echo "Fixing data directory permissions" > "$LOOP_INIT_DIR/status"
: > "$LOOP_INIT_DIR/log"
chown poduser:poduser "$LOOP_INIT_DIR/status" "$LOOP_INIT_DIR/log"
gosu poduser node /app/src/init-server.js &
init_pid=$!
echo $init_pid > "$LOOP_INIT_DIR/pid"

# Port check. Host networking means Docker never checks whether PORT is free, so
# wait for the status server to either bind it or exit. If it exits, it has
# already printed why (e.g. the port is taken), so stop the container now
# rather than after the multi-minute startup.
for _ in $(seq 100); do
  [ -e "$LOOP_INIT_DIR/listening" ] && break
  if ! kill -0 "$init_pid" 2>/dev/null; then
    wait "$init_pid" || rc=$?
    echo "[loop] Startup aborted: could not bind port ${PORT:-9876} (exit ${rc:-0})." >&2
    exit 1
  fi
  sleep 0.1
done

# Ensure the data dir and claude config dir are writable by poduser
chown -R poduser:poduser /data 2>/dev/null || true
mkdir -p /claudeconfig && chown poduser:poduser /claudeconfig

# /dev/kvm shows up here because the container is privileged, but as root:kvm
# 0660 with the host's kvm gid, so rootless podman (poduser) can't open it or
# pass it on with --device. This /dev is the container's own, so the chmod
# doesn't touch the host's node.
if [ -c /dev/kvm ]; then chmod 666 /dev/kvm; fi

exec /entrypoint.sh "$@"
