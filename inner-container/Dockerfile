FROM ubuntu:24.04

# Node 22+ is required: @anthropic-ai/claude-code declares `engines.node >=22`
# from 2.1.198 onward. npm silently resolves the newest version whose engines
# the running Node satisfies, so on Node 20 `npm install -g` kept installing
# 2.1.197 forever and the sandbox never picked up new Claude Code releases —
# no amount of --no-cache rebuilding could fix that.
# tzdata is needed for the TZ env var (set from Loop's timezone setting) to
# resolve to a real zone instead of silently falling back to UTC.
RUN apt-get update && apt-get install -y curl ca-certificates git tzdata && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# @latest is explicit so a stale local metadata cache can't pin an old version,
# and the version is echoed into the build log to make regressions like the one
# above visible at build time.
RUN npm install -g @anthropic-ai/claude-code@latest && claude --version

WORKDIR /project
CMD ["claude"]
