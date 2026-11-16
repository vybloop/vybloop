#!/bin/bash
set -e

# Ensure the data dir and claude config dir are writable by poduser
chown -R poduser:poduser /data 2>/dev/null || true
mkdir -p /claudeconfig && chown poduser:poduser /claudeconfig

# /dev/kvm shows up here because the container is privileged, but as root:kvm
# 0660 with the host's kvm gid, so rootless podman (poduser) can't open it or
# pass it on with --device. This /dev is the container's own, so the chmod
# doesn't touch the host's node.
if [ -c /dev/kvm ]; then chmod 666 /dev/kvm; fi

exec /entrypoint.sh "$@"
