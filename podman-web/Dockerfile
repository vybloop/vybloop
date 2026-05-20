# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production server ────────────────────────────────────────────────
FROM podman-base:latest
USER root

RUN apt-get update && apt-get install -y \
    nodejs npm python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package*.json ./
RUN npm install --omit=dev

COPY server/ ./
COPY --from=frontend-builder /frontend/dist ./public

RUN chown -R poduser:poduser /app

EXPOSE 3000
CMD ["node", "server.js"]
