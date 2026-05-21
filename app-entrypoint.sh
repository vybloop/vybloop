#!/bin/bash
set -e

# Ensure the data dir and claude config dir are writable by poduser
chown poduser:poduser /data 2>/dev/null || true
mkdir -p /claudeconfig && chown poduser:poduser /claudeconfig

exec /entrypoint.sh "$@"
