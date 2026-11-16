// Placeholder web server that runs while the container is still initializing.
//
// app-entrypoint.sh starts this (as poduser, in the background) before anything
// slow happens — the `chown -R /data`, podman migrate/renumber, orphan cleanup
// and, on first boot or after an inner-container/Dockerfile change, the
// multi-minute `podman build` of claude-inner. Until start.sh is ready to exec
// the real server, anyone visiting Loop gets a status page instead of
// "connection refused".
//
// Deliberately self-contained: built-in modules only, and nothing from the rest
// of backend/src, so it starts in milliseconds and can't be broken by an import
// that does work at load time.
//
// Progress comes from files written by app-entrypoint.sh / start.sh:
//   $LOOP_INIT_DIR/status  — one line, the current step
//   $LOOP_INIT_DIR/log     — everything start.sh prints (tee'd)
//
// Handover: start.sh sends SIGTERM, waits for this process to exit (the port is
// free once it has), then execs server.js on the same port. The page polls
// /__loop-init/status; once a response comes back without the
// X-Loop-Initializing header, the real server is answering and it reloads.

import http from 'node:http';
import { readFileSync, writeFileSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';

const PORT = process.env.PORT || 9876;
const DIR = process.env.LOOP_INIT_DIR || '/tmp/loop-init';
const STARTED = Date.now();
const LOG_TAIL_BYTES = 64 * 1024;

function readStatus() {
  try {
    return readFileSync(`${DIR}/status`, 'utf8').trim() || 'Starting';
  } catch {
    return 'Starting';
  }
}

function readLogTail() {
  let fd;
  try {
    fd = openSync(`${DIR}/log`, 'r');
    const { size } = fstatSync(fd);
    const len = Math.min(size, LOG_TAIL_BYTES);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    let text = buf.toString('utf8');
    // Drop a partial first line when we started mid-file.
    if (size > len) text = text.slice(text.indexOf('\n') + 1);
    // podman build progress uses \r; keep only the last state of each line.
    return text.split('\n').map(l => l.replace(/\r+$/, '').split('\r').pop()).join('\n');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Loop — starting</title>
<style>
  :root {
    --bg-0: oklch(0.16 0.005 60); --bg-1: oklch(0.20 0.006 60); --line: oklch(0.32 0.008 60);
    --fg-0: oklch(0.97 0.005 90); --fg-1: oklch(0.85 0.008 80); --fg-2: oklch(0.65 0.01 75);
    --fg-3: oklch(0.50 0.012 75); --accent: oklch(0.84 0.18 130); --del: oklch(0.72 0.18 25);
    --font-sans: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
    --font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { background: var(--bg-0); color: var(--fg-1); font-family: var(--font-sans);
         display: flex; justify-content: center; padding: 48px 16px; }
  main { width: 100%; max-width: 860px; display: flex; flex-direction: column; gap: 20px; min-height: 0; }
  h1 { color: var(--fg-0); font-size: 20px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); color: var(--accent);
         animation: pulse 1.6s infinite; flex: none; }
  .dot.down { background: var(--del); color: var(--del); animation: none; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 currentColor; } 70%, 100% { box-shadow: 0 0 0 7px transparent; } }
  p { color: var(--fg-2); font-size: 14px; line-height: 1.5; }
  .step { color: var(--fg-0); font-size: 15px; }
  .meta { color: var(--fg-3); font-size: 12px; font-family: var(--font-mono); }
  pre { background: var(--bg-1); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px;
        font: 12px/1.5 var(--font-mono); color: var(--fg-2); overflow: auto; white-space: pre-wrap;
        word-break: break-all; flex: 1; min-height: 160px; max-height: 60vh; }
  pre:empty { display: none; }
</style>
</head>
<body>
<main>
  <h1><span class="dot" id="dot"></span>Loop is starting up</h1>
  <p>The server is still preparing its container environment. The first start, or one after
     the sandbox image changed, can take several minutes. This page reloads into Loop as soon as it's ready.</p>
  <div>
    <div class="step" id="step">…</div>
    <div class="meta" id="meta"></div>
  </div>
  <pre id="log"></pre>
</main>
<script>
  const $ = id => document.getElementById(id);
  let follow = true;
  $('log').addEventListener('scroll', e => {
    const el = e.target;
    follow = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
  });
  function fmt(s) { const m = Math.floor(s / 60); return m ? m + 'm ' + (s % 60) + 's' : s + 's'; }
  async function poll() {
    try {
      const res = await fetch('/__loop-init/status', { cache: 'no-store' });
      if (!res.headers.get('X-Loop-Initializing')) { location.reload(); return; }
      const s = await res.json();
      $('dot').classList.remove('down');
      $('step').textContent = s.step;
      $('meta').textContent = 'elapsed ' + fmt(s.elapsed);
      if ($('log').textContent !== s.log) {
        $('log').textContent = s.log;
        if (follow) $('log').scrollTop = $('log').scrollHeight;
      }
    } catch {
      // Expected for a moment during the handover to the real server.
      $('dot').classList.add('down');
      $('meta').textContent = 'waiting for the server…';
    }
    setTimeout(poll, 1500);
  }
  poll();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const headers = {
    'X-Loop-Initializing': '1',
    'Cache-Control': 'no-store',
    'Retry-After': '5',
  };
  const path = (req.url || '/').split('?')[0];

  if (path === '/__loop-init/status') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      step: readStatus(),
      elapsed: Math.round((Date.now() - STARTED) / 1000),
      log: readLogTail(),
    }));
    return;
  }

  // An already-open Loop tab (e.g. across a container restart) keeps calling the
  // API; tell it plainly that the server isn't up rather than serving HTML.
  if (path.startsWith('/api/')) {
    res.writeHead(503, { ...headers, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Loop is still starting up', initializing: true }));
    return;
  }

  res.writeHead(503, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
  res.end(req.method === 'HEAD' ? undefined : PAGE);
});

// WebSocket upgrades (terminals) have nothing to connect to yet; the frontend
// retries on its own once the real server is up.
server.on('upgrade', (_req, socket) => socket.destroy());

// This is also the container's port check. With network_mode: host, Docker
// publishes no ports and so never checks whether PORT is free on the host.
// app-entrypoint.sh waits for this process to either listen (it writes
// $DIR/listening) or exit, and on exit stops the container before any slow
// startup work, so a taken port doesn't surface minutes later as server.js
// failing after the claude-inner build.
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error([
      '',
      `[loop] ERROR: port ${PORT} is already in use on the host.`,
      `[loop] Loop runs with host networking, so it binds port ${PORT} on the host itself.`,
      `[loop] Another process, or another Loop instance, is already listening there.`,
      `[loop] Find it with: ss -ltnp 'sport = :${PORT}'`,
      `[loop] Then stop it, or set PORT=<free port> in .env and recreate the container.`,
      '',
    ].join('\n'));
    process.exit(98);
  }
  console.error(`[loop] ERROR: could not listen on port ${PORT}: ${err.message}`);
  process.exit(1);
});

function shutdown() {
  server.close(() => process.exit(0));
  server.closeAllConnections?.();
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => {
  console.log(`[init-server] status page on port ${PORT}`);
  try { writeFileSync(`${DIR}/listening`, ''); } catch {}
});
