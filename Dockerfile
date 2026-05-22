# syntax=docker/dockerfile:1
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
RUN npm run build

FROM podman-base:latest
USER root

RUN apt-get update && apt-get install -y nodejs npm python3 build-essential tmux \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY backend/src ./src
COPY backend/tmux.conf ./
COPY --from=frontend-builder /build/dist ./public
COPY inner-container/ ./inner-container/
COPY start.sh app-entrypoint.sh ./
RUN chmod +x start.sh app-entrypoint.sh && chown -R poduser:poduser /app

EXPOSE 3000
ENTRYPOINT ["/app/app-entrypoint.sh"]
CMD ["/app/start.sh"]
