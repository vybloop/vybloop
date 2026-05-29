import { createServer } from 'net';
import { readFileSync, writeFileSync, chmodSync, unlinkSync, existsSync } from 'fs';

const SOCKET_PATH = '/claudeconfig/loop-events.sock';
const HOOK_SCRIPT_PATH = '/claudeconfig/loop-notify-done.sh';
const SETTINGS_PATH = '/claudeconfig/settings.json';

function installHook() {
  // Write the notify script
  writeFileSync(HOOK_SCRIPT_PATH, `#!/bin/sh
node -e "
const net = require('net');
const projectId = process.env.LOOP_PROJECT_ID || '';
const client = net.createConnection('/claudeconfig/loop-events.sock', function() {
  client.write(JSON.stringify({event:'agent-done',projectId:projectId}) + '\\n');
  client.end();
});
client.on('error', function() {});
"
`, { mode: 0o755 });

  // Merge Stop hook into settings.json
  let settings = {};
  if (existsSync(SETTINGS_PATH)) {
    try { settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')); } catch {}
  }

  const hookEntry = { hooks: [{ type: 'command', command: `bash ${HOOK_SCRIPT_PATH}` }] };

  if (!settings.hooks) settings.hooks = {};
  const stopHooks = settings.hooks.Stop ?? [];

  // Replace existing loop hook or append
  const idx = stopHooks.findIndex(h => h.hooks?.some(e => e.command?.includes('loop-notify-done')));
  if (idx >= 0) stopHooks[idx] = hookEntry;
  else stopHooks.push(hookEntry);

  settings.hooks.Stop = stopHooks;
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

export function startIpcServer(onEvent) {
  try {
    installHook();
  } catch (err) {
    console.error('[ipc] failed to install hook:', err.message);
  }

  if (existsSync(SOCKET_PATH)) {
    try { unlinkSync(SOCKET_PATH); } catch {}
  }

  const server = createServer((socket) => {
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          onEvent(msg);
        } catch {}
      }
    });
    socket.on('error', () => {});
  });

  server.listen(SOCKET_PATH, () => {
    try { chmodSync(SOCKET_PATH, 0o777); } catch {}
    console.log('[ipc] listening on', SOCKET_PATH);
  });

  server.on('error', (err) => {
    console.error('[ipc] server error:', err.message);
  });

  return server;
}
