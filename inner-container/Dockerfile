FROM ubuntu:24.04

# Node here is for projects and Loop's helper scripts (the Stop hook, the git
# credential helper), not for the agent CLIs: those bring their own Node on the
# loop-agents volume (see below), so a project changing this one can't break them.
# tzdata is needed for the TZ env var (set from Loop's timezone setting) to
# resolve to a real zone instead of silently falling back to UTC.
# nano is the interactive editor for git (commit messages, rebase todos) and
# anything else honouring $EDITOR; the base image ships none, so git would
# otherwise fail with "Terminal is dumb" / no editor available.
# zip lets /claudeconfig/loop-share.sh hand a shared directory over as a .zip
# (it falls back to tar.gz without it).
RUN apt-get update && apt-get install -y curl ca-certificates git tzdata nano zip && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Claude Code and Codex are not installed in the image. They live on the
# `loop-agents` volume, mounted read-only at /opt/loop by every sandbox and
# populated by install-agents.sh (backend/src/agent-toolchain.js), so updating
# them never invalidates this image's layers or anything built on top of it.
RUN ln -s /opt/loop/bin/claude /usr/local/bin/claude && \
    ln -s /opt/loop/bin/codex /usr/local/bin/codex

WORKDIR /project
CMD ["claude"]
