import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const term = new Terminal({
  cursorBlink: true,
  scrollback: 1000,
  fontFamily: '"Cascadia Code", monospace',
  theme: {
    background: '#1a1a2e',
    foreground: '#e0e0e0',
    cursor: '#a0c4ff',
  },
});

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal-container'));
fitAddon.fit();

const statusEl = document.getElementById('status');
const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${location.host}/terminal`);
ws.binaryType = 'arraybuffer';

ws.onopen = () => {
  statusEl.textContent = 'Connected';
  statusEl.className = 'connected';
  sendResize();
};

ws.onmessage = (event) => {
  if (event.data instanceof ArrayBuffer) {
    term.write(new Uint8Array(event.data));
  } else {
    term.write(event.data);
  }
};

ws.onclose = () => {
  statusEl.textContent = 'Disconnected';
  statusEl.className = 'error';
  term.write('\r\n\x1b[31m[Session ended]\x1b[0m\r\n');
};

ws.onerror = () => {
  statusEl.textContent = 'Connection error';
  statusEl.className = 'error';
};

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'v' && document.activeElement === term.textarea) {
    e.stopImmediatePropagation();
    // no preventDefault — browser fires paste event on the textarea,
    // which xterm's own paste handler picks up and sends to the terminal
  }
}, true);

term.attachCustomKeyEventHandler((e) => {
  if (e.type === 'keydown' && e.ctrlKey && e.key === 'c' && term.hasSelection()) {
    document.execCommand('copy');
    return false;
  }
  return true;
});

term.onData((data) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data }));
  }
});

function sendResize() {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  }
}

term.onResize(sendResize);

const resizeObserver = new ResizeObserver(() => fitAddon.fit());
resizeObserver.observe(document.getElementById('terminal-container'));
