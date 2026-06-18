// Git credential broker. Git operations (in the outer backend AND inside the
// claude-inner agent/shell containers) authenticate to GitHub via a credential
// helper instead of a token baked into the remote URL. The helper asks this
// broker — over a unix socket in the shared /claudeconfig mount — for fresh
// credentials per request, so short-lived GitHub App installation tokens are
// always current. Mirrors the IPC pattern in ipc-server.js.
import { createServer } from 'net';
import { writeFileSync, chmodSync, unlinkSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { getCredentialForOwner } from './git-auth.js';

const SOCKET_PATH = '/claudeconfig/loop-git-credential.sock';
const HELPER_PATH = '/claudeconfig/loop-git-credential.js';
// Shared global gitconfig, pointed at by GIT_CONFIG_GLOBAL in both the backend
// process and the inner containers.
export const GIT_CONFIG_PATH = '/claudeconfig/gitconfig';

// Node credential helper. Reads git's key=value request on stdin, derives the
// repo owner from the path, and relays a credential lookup over the socket.
const HELPER_SCRIPT = `#!/usr/bin/env node
const net = require('net');
if (process.argv[2] !== 'get') process.exit(0); // only handle credential lookups
let input = '';
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', () => {
  const fields = {};
  for (const line of input.split('\\n')) {
    const i = line.indexOf('=');
    if (i > 0) fields[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  const owner = (fields.path || '').split('/')[0] || '';
  const req = JSON.stringify({ host: fields.host || '', owner }) + '\\n';
  const client = net.createConnection('${SOCKET_PATH}', () => client.write(req));
  let buf = '';
  client.on('data', d => { buf += d; });
  client.on('end', () => {
    try {
      const cred = JSON.parse(buf);
      if (cred && cred.username) {
        process.stdout.write('username=' + cred.username + '\\n');
        process.stdout.write('password=' + (cred.password || '') + '\\n');
      }
    } catch {}
    process.exit(0);
  });
  client.on('error', () => process.exit(0));
});
`;

function install() {
  writeFileSync(HELPER_PATH, HELPER_SCRIPT, { mode: 0o755 });
  // Merge into the shared gitconfig (don't overwrite — identity lives here too).
  execFileSync('git', ['config', '--file', GIT_CONFIG_PATH, 'credential.helper', `!node ${HELPER_PATH}`]);
  // useHttpPath gives the helper the repo path, so it can tell which owner/install.
  execFileSync('git', ['config', '--file', GIT_CONFIG_PATH, 'credential.useHttpPath', 'true']);
  try { chmodSync(GIT_CONFIG_PATH, 0o666); } catch {}
}

export function startCredentialBroker() {
  try {
    install();
  } catch (err) {
    console.error('[git-cred] failed to install helper:', err.message);
  }

  if (existsSync(SOCKET_PATH)) {
    try { unlinkSync(SOCKET_PATH); } catch {}
  }

  const server = createServer((socket) => {
    let buf = '';
    socket.on('data', async (chunk) => {
      buf += chunk.toString();
      const nl = buf.indexOf('\n');
      if (nl < 0) return; // one newline-terminated request per connection
      const line = buf.slice(0, nl);
      buf = '';
      let owner = '';
      try { owner = JSON.parse(line).owner || ''; } catch {}
      let cred = null;
      try {
        cred = await getCredentialForOwner(owner);
      } catch (e) {
        console.error('[git-cred] lookup failed:', e.message);
      }
      socket.end(JSON.stringify(cred || {}));
    });
    socket.on('error', () => {});
  });

  server.listen(SOCKET_PATH, () => {
    try { chmodSync(SOCKET_PATH, 0o777); } catch {}
    console.log('[git-cred] listening on', SOCKET_PATH);
  });

  server.on('error', (err) => {
    console.error('[git-cred] server error:', err.message);
  });

  return server;
}
