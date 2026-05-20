const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const runRouter = require('./routes/run');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', runRouter);

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  if (pathname === '/terminal') {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws));
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  const shell = pty.spawn('podman', [
    'run', '--rm', '-it',
    '-v', '/project:/project',
    '-v', '/home/poduser/claude-root:/root',
    '-w', '/project',
    '--env', 'ANTHROPIC_API_KEY',
    '--env', 'IS_SANDBOX=1',
    'claude-inner',
    'claude', '--dangerously-skip-permissions',
  ], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || '/home/poduser',
    env: process.env,
  });

  shell.on('data', (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(Buffer.from(data));
    }
  });

  shell.on('exit', () => {
    if (ws.readyState === ws.OPEN) ws.close();
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'input') {
        shell.write(msg.data);
      } else if (msg.type === 'resize') {
        shell.resize(msg.cols, msg.rows);
      }
    } catch {
      shell.write(raw.toString());
    }
  });

  ws.on('close', () => {
    try { shell.kill(); } catch {}
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Podman web server listening on port ${PORT}`);
});
