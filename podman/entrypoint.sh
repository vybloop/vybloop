#!/bin/bash
set -e

chmod 666 /dev/fuse

# The tmpfs at this path is mounted fresh as root each time the container starts.
chown -R poduser:poduser /home/poduser/.local/share/containers

mkdir -p /run/user/1000
chown poduser:poduser /run/user/1000
chmod 700 /run/user/1000

exec gosu poduser env HOME=/home/poduser XDG_RUNTIME_DIR=/run/user/1000 "$@"
