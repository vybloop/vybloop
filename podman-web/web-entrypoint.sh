#!/bin/bash
set -e

mkdir -p /home/poduser/claudeconfig
chown poduser:poduser /home/poduser/claudeconfig

mkdir -p /project
chown poduser:poduser /project

exec /entrypoint.sh "$@"
