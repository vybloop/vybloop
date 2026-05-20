#!/bin/bash
set -e

mkdir -p /home/poduser/claude-root
chown poduser:poduser /home/poduser/claude-root

mkdir -p /project
chown poduser:poduser /project

exec /entrypoint.sh "$@"
