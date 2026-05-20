FROM podman-base:latest

USER root

RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package.json ./
RUN npm install --omit=dev

COPY server/ ./
RUN chown -R poduser:poduser /app

EXPOSE 3000

CMD ["node", "server.js"]
