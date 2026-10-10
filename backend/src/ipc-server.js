import { createServer } from 'net';
import { readFileSync, writeFileSync, chmodSync, unlinkSync, existsSync } from 'fs';

const SOCKET_PATH = '/claudeconfig/loop-events.sock';
const HOOK_SCRIPT_PATH = '/claudeconfig/loop-notify-done.sh';
const START_SCRIPT_PATH = '/claudeconfig/loop-notify-start.sh';
const SETTINGS_PATH = '/claudeconfig/settings.json';

function notifyScript(event) {
  return `#!/bin/sh
node -e "
const net = require('net');
const projectId = process.env.LOOP_PROJECT_ID || '';
const client = net.createConnection('/claudeconfig/loop-events.sock', function() {
  client.write(JSON.stringify({event:'${event}',projectId:projectId}) + '\\n');
  client.end();
});
client.on('error', function() {});
"
`;
}

// Replace an existing loop hook (matched by script name) or append one.
function mergeHook(settings, hookName, scriptPath, marker) {
  const hookEntry = { hooks: [{ type: 'command', command: `bash ${scriptPath}` }] };
  const entries = settings.hooks[hookName] ?? [];
  const idx = entries.findIndex(h => h.hooks?.some(e => e.command?.includes(marker)));
  if (idx >= 0) entries[idx] = hookEntry;
  else entries.push(hookEntry);
  settings.hooks[hookName] = entries;
}

function installHook() {
  // Stop -> agent-done (the turn finished); UserPromptSubmit -> agent-start
  // (the agent picked up a prompt and is working). Codex only has the former.
  writeFileSync(HOOK_SCRIPT_PATH, notifyScript('agent-done'), { mode: 0o755 });
  writeFileSync(START_SCRIPT_PATH, notifyScript('agent-start'), { mode: 0o755 });

  // Merge Stop hook into settings.json
  let settings = {};
  if (existsSync(SETTINGS_PATH)) {
    try { settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')); } catch {}
  }

  if (!settings.hooks) settings.hooks = {};
  mergeHook(settings, 'Stop', HOOK_SCRIPT_PATH, 'loop-notify-done');
  mergeHook(settings, 'UserPromptSubmit', START_SCRIPT_PATH, 'loop-notify-start');
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
