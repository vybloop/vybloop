#!/bin/bash
set -e

chmod 666 /dev/fuse

# Make podman's storage root writable by poduser. Deliberately NOT recursive.
#
# This used to be `chown -R`, written when this path was a tmpfs (see
# podman/docker-compose.yml) that starts empty and root-owned on every boot, so
# recursing cost nothing. Loop mounts a persistent named volume here instead, and
# a recursive chown over it caused two problems:
#   1. Slow startup with no output. Once the volume held about 1.2M files (43 GB of
#      image layers), `docker compose up` sat at "Attaching to loop-1" for
#      minutes before start.sh printed anything (2026-10-29).
#   2. Corrupted ownership inside images and volumes. Rootless podman stores a
#      file owned by a non-root in-container user as a host subuid (100000+, from
#      /etc/subuid); for example, uid 998 in the image is 100997 on disk. The
#      recursive chown reset every file to poduser, which is root inside the
#      containers. Any image or compose volume that relies on a non-root owner
#      (a database data dir, a `node` user's home, apt's _apt dirs) was
#      silently changed to root-owned on each boot.
# Only the top-level directory needs fixing. Docker gives a new named volume the
# image directory's owner (set to poduser in the Dockerfile), and a fresh tmpfs
# only has the top-level directory. Podman manages ownership of everything below it.
#
# If ownership problems come back, don't restore `-R` here:
#   - "Permission denied" under /data/<project> is a different issue, handled by
#     the `chown -R /data` in app-entrypoint.sh (repo files must be owned by
#     poduser so the agent container's root maps onto them).
#   - If poduser's uid ever changes, run a one-time
#     `chown -R --from=<old>:<old> poduser:poduser` on this path, which moves only
#     the old owner's files and leaves subuid-owned ones alone.
chown poduser:poduser /home/poduser/.local/share/containers

mkdir -p /run/user/1000
chown poduser:poduser /run/user/1000
chmod 700 /run/user/1000

exec gosu poduser env HOME=/home/poduser XDG_RUNTIME_DIR=/run/user/1000 "$@"
