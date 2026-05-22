import { LitElement, html, css, unsafeCSS } from 'lit';
import './loop-top-bar.js';
import {
  iconArrowLeft, iconPlay, iconStop, iconChevronDown, iconRefresh,
  iconExternal, iconTerminal, iconSparkle, iconCopy, iconCheck,
  iconBranch, iconChevron, iconPencil, iconSend
} from './icons.js';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import xtermCss from '@xterm/xterm/css/xterm.css?inline';

const _isMac = /Macintosh|MacIntel/.test(navigator.userAgent);
const _modKey = _isMac ? '⌘' : 'Ctrl-';

class LoopProjectScreen extends LitElement {
  static properties = {
    project: { type: Object },
    _files: { state: true },
    _running: { state: true },
    _commitMsg: { state: true },
    _activeTab: { state: true },
    _committing: { state: true },
    _committed: { state: true },
    _loading: { state: true },
    _narrow: { state: true },
    _inputOpen: { state: true },
    _mobileInput: { state: true },
    _remoteStatus: { state: true },
    _syncing: { state: true },
    _commitError: { state: true },
    _identityNeeded: { state: true },
    _identityName: { state: true },
    _identityEmail: { state: true },
    _savingIdentity: { state: true },
  };

  static styles = [css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
      background: var(--bg-0);
    }
    .layout {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    /* Sidebar */
    .sidebar {
      width: 320px;
      flex-shrink: 0;
      background: var(--bg-0);
      border-right: 1px solid var(--line-soft);
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden scroll;
    }
    .sidebar.as-tab {
      width: 100%;
      border-right: none;
      flex: 1;
    }
    .sidebar-top {
      padding: 12px;
      border-bottom: 1px solid var(--line-soft);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .run-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .run-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      height: 34px;
      border: none;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: opacity 0.12s, background 0.12s;
    }
    .run-btn.idle {
      background: var(--accent);
      color: var(--accent-fg);
    }
    .run-btn.running {
      background: oklch(0.72 0.18 25 / 0.15);
      color: var(--del);
      border: 1px solid oklch(0.72 0.18 25 / 0.3);
    }
    .run-btn:hover { opacity: 0.85; }
    .run-btn-pulse {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
      animation: pulseDot 2s ease-in-out infinite;
    }
    .chevron-btn {
      width: 34px;
      height: 34px;
      border-radius: var(--radius);
      border: 1px solid var(--line-soft);
      background: var(--bg-2);
      color: var(--fg-2);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s;
    }
    .chevron-btn:hover { background: var(--bg-3); }
    .server-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-sm);
      padding: 6px 10px;
    }
    .server-info {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      color: var(--fg-2);
    }
    .server-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--add);
      animation: pulseDot 2s ease-in-out infinite;
    }
    .server-link {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--accent);
    }
    .icon-btn-sm {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: var(--radius-sm);
      border: none;
      background: transparent;
      color: var(--fg-3);
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
    }
    .icon-btn-sm:hover { background: var(--bg-3); color: var(--fg-1); }

    /* Changes section */
    .changes-section {
      flex-shrink: 0;
      min-height: 0;
      overflow-y: auto;
      padding: 0;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px 6px;
      position: sticky;
      top: 0;
      background: var(--bg-0);
      z-index: 1;
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--fg-3);
    }
    .count-badge {
      background: var(--bg-3);
      color: var(--fg-2);
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 100px;
      border: 1px solid var(--line-soft);
    }
    .section-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .link-btn {
      font-size: 11px;
      color: var(--accent);
      background: none;
      border: none;
      cursor: pointer;
      font-family: var(--font-sans);
      padding: 2px 4px;
      border-radius: 4px;
      transition: background 0.1s;
    }
    .link-btn:hover { background: var(--accent-soft); }
    .subhead {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--fg-3);
      padding: 6px 12px 3px;
    }
    .file-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 12px;
      cursor: pointer;
      transition: background 0.1s;
      min-height: 30px;
    }
    .file-row:hover { background: var(--bg-2); }
    .file-checkbox {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      border: 1.5px solid var(--line);
      background: transparent;
      cursor: pointer;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.1s, border-color 0.1s;
    }
    .file-checkbox.checked {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--accent-fg);
    }
    .status-badge {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 700;
      font-family: var(--font-mono);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .status-M { background: oklch(0.78 0.14 80 / 0.18); color: var(--mod); }
    .status-A { background: oklch(0.78 0.16 145 / 0.18); color: var(--add); }
    .status-D { background: oklch(0.72 0.18 25 / 0.18); color: var(--del); }
    .status-R { background: oklch(0.78 0.16 65 / 0.18); color: var(--warn); }
    .file-path {
      flex: 1;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-1);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-path .dir { color: var(--fg-3); }
    .diff-stat {
      font-size: 10px;
      font-family: var(--font-mono);
      display: flex;
      gap: 3px;
      flex-shrink: 0;
    }
    .diff-add { color: var(--add); }
    .diff-del { color: var(--del); }
    .clean-state {
      padding: 20px 12px;
      text-align: center;
      color: var(--fg-3);
      font-size: 12px;
    }

    /* Commit box */
    .commit-box {
      border-top: 1px solid var(--line-soft);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
    }
    .commit-textarea {
      width: 100%;
      min-height: 62px;
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-sm);
      color: var(--fg-0);
      font-family: var(--font-sans);
      font-size: 12px;
      padding: 8px 10px;
      resize: none;
      outline: none;
      transition: border-color 0.12s;
      line-height: 1.5;
    }
    .commit-textarea:focus { border-color: var(--accent); }
    .commit-textarea:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .commit-textarea::placeholder { color: var(--fg-3); }
    .commit-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .branch-indicator {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--fg-3);
    }
    .commit-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: opacity 0.12s;
      white-space: nowrap;
    }
    .commit-btn:hover:not(:disabled) { opacity: 0.85; }
    .commit-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .commit-error {
      font-size: 11px;
      color: var(--del);
      line-height: 1.4;
      word-break: break-word;
    }
    .identity-card {
      background: var(--bg-2);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .identity-card-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--fg-1);
    }
    .identity-card-sub {
      font-size: 11px;
      color: var(--fg-3);
      margin-top: -4px;
    }
    .identity-inputs {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .identity-input {
      background: var(--bg-0);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-sm);
      color: var(--fg-0);
      font-family: var(--font-sans);
      font-size: 12px;
      padding: 5px 8px;
      outline: none;
      transition: border-color 0.12s;
    }
    .identity-input:focus { border-color: var(--accent); }
    .identity-input::placeholder { color: var(--fg-3); }
    .identity-save-btn {
      align-self: flex-end;
      padding: 5px 14px;
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: opacity 0.12s;
    }
    .identity-save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .identity-save-btn:not(:disabled):hover { opacity: 0.85; }
    .sync-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 10px;
      background: transparent;
      color: var(--fg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-sm);
      font-size: 11px;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: opacity 0.12s, background 0.12s;
      white-space: nowrap;
    }
    .sync-btn:hover:not(:disabled) { background: var(--bg-2); }
    .sync-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .remote-counts {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 10px;
      font-family: var(--font-mono);
    }
    .remote-ahead { color: var(--add); }
    .remote-behind { color: var(--accent); }

    /* Main area */
    .main-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--bg-0);
    }
    .tab-bar {
      display: flex;
      align-items: center;
      border-bottom: 1px solid var(--line-soft);
      padding: 0 16px;
      background: var(--bg-1);
      flex-shrink: 0;
      justify-content: space-between;
      gap: 8px;
    }
    .tabs {
      display: flex;
      align-items: center;
      min-width: 0;
      flex: 1;
    }
    .tab-logo {
      display: none;
      align-items: center;
      padding: 0 10px 0 4px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .tab {
      padding: 12px 14px;
      font-size: 13px;
      font-weight: 500;
      color: var(--fg-3);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 0.12s;
      margin-bottom: -1px;
    }
    .tab:hover { color: var(--fg-1); }
    .tab.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }
    .connection-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 500;
      padding: 3px 9px;
      border-radius: 100px;
      background: oklch(0.78 0.16 145 / 0.1);
      color: var(--add);
      border: 1px solid oklch(0.78 0.16 145 / 0.2);
    }
    .connection-chip .dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: currentColor;
      animation: pulseDot 2s ease-in-out infinite;
    }
    .idle-chip {
      background: var(--bg-3);
      color: var(--fg-3);
      border-color: var(--line-soft);
    }
    .idle-chip .dot {
      background: currentColor;
      animation: none;
      opacity: 0.5;
    }

    /* Terminal placeholder */
    .terminal-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.6;
    }
    .agent-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--accent-soft);
      color: var(--accent);
      border: 1px solid oklch(0.84 0.18 130 / 0.3);
      border-radius: 100px;
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 600;
      font-family: var(--font-sans);
      margin-bottom: 20px;
    }
    .transcript-line {
      margin-bottom: 12px;
    }
    .user-bubble {
      display: inline-block;
      background: var(--accent-soft);
      border: 1px solid oklch(0.84 0.18 130 / 0.25);
      color: var(--accent);
      border-radius: var(--radius);
      border-bottom-left-radius: 3px;
      padding: 8px 12px;
      font-family: var(--font-sans);
      font-size: 13px;
      max-width: 480px;
    }
    .agent-think {
      color: var(--fg-3);
      font-style: italic;
      font-family: var(--font-sans);
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
    }
    .agent-text {
      color: var(--fg-1);
      font-family: var(--font-sans);
      font-size: 13px;
      line-height: 1.65;
    }
    .tool-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-family: var(--font-mono);
      padding: 2px 8px;
      border-radius: 4px;
      margin: 2px 0;
    }
    .tool-read {
      background: oklch(0.78 0.14 80 / 0.12);
      color: var(--mod);
      border: 1px solid oklch(0.78 0.14 80 / 0.25);
    }
    .tool-write {
      background: oklch(0.78 0.16 145 / 0.12);
      color: var(--add);
      border: 1px solid oklch(0.78 0.16 145 / 0.25);
    }
    .tool-run {
      background: oklch(0.78 0.16 65 / 0.12);
      color: var(--warn);
      border: 1px solid oklch(0.78 0.16 65 / 0.25);
    }
    .done-line {
      display: flex;
      align-items: center;
      gap: 7px;
      color: var(--add);
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 500;
      margin-top: 4px;
    }
    .cursor-blink {
      display: inline-block;
      width: 8px;
      height: 14px;
      background: var(--accent);
      opacity: 0.7;
      animation: blink 1s step-end infinite;
      vertical-align: middle;
      border-radius: 1px;
      margin-left: 2px;
    }

    #xterm-container {
      flex: 1;
      min-height: 0;
    }
    #xterm-container .xterm,
    #xterm-container .xterm-viewport,
    #xterm-container .xterm-screen {
      height: 100% !important;
    }

    /* Narrow / mobile layout */
    @media (max-width: 768px) {
      .tab-bar {
        padding: 0 4px 0 0;
      }
      .tab-logo {
        display: flex;
      }
      .tab {
        padding: 10px 10px;
        font-size: 12px;
      }
      .sidebar.as-tab .sidebar-top {
        padding: 10px;
      }
      .sidebar.as-tab .commit-box {
        padding: 10px;
      }
    }
    /* Mobile input FAB + bar */
    :host {
      position: relative;
    }
    .input-fab {
      position: absolute;
      bottom: 56px;
      right: 16px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 12px oklch(0 0 0 / 0.35);
      z-index: 10;
      transition: opacity 0.15s, transform 0.15s;
    }
    .input-fab:active { transform: scale(0.93); }
    .input-fab-stop {
      bottom: 116px;
      background: oklch(0.72 0.18 25 / 0.15);
      color: var(--del);
      border: 1px solid oklch(0.72 0.18 25 / 0.3);
      box-shadow: 0 2px 12px oklch(0 0 0 / 0.2);
    }
    .mobile-input-backdrop {
      position: absolute;
      inset: 0;
      z-index: 9;
    }
    .mobile-input-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--bg-1);
      border-top: 1px solid var(--line-soft);
      padding: 10px 12px;
      display: flex;
      align-items: flex-end;
      gap: 8px;
      z-index: 10;
    }
    .mobile-input-textarea {
      flex: 1;
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      color: var(--fg-0);
      font-family: var(--font-sans);
      font-size: 15px;
      padding: 8px 12px;
      resize: none;
      outline: none;
      min-height: 42px;
      max-height: 120px;
      line-height: 1.5;
      transition: border-color 0.12s;
    }
    .mobile-input-textarea:focus { border-color: var(--accent); }
    .mobile-input-textarea::placeholder { color: var(--fg-3); }
    .mobile-input-send {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.12s, transform 0.12s;
    }
    .mobile-input-send:disabled { opacity: 0.35; cursor: not-allowed; }
    .mobile-input-send:not(:disabled):active { transform: scale(0.93); }
  `, unsafeCSS(xtermCss)];

  constructor() {
    super();
    this.project = null;
    this._files = [];
    this._running = false;
    this._commitMsg = '';
    this._activeTab = 'agent';
    this._committing = false;
    this._committed = false;
    this._loading = true;
    this._term = null;
    this._termFit = null;
    this._termWs = null;
    this._mq = window.matchMedia('(max-width: 768px)');
    this._narrow = this._mq.matches;
    this._inputOpen = false;
    this._mobileInput = '';
    this._remoteStatus = null;
    this._syncing = false;
    this._commitError = '';
    this._identityNeeded = false;
    this._identityName = '';
    this._identityEmail = '';
    this._savingIdentity = false;
    this._mqHandler = (e) => {
      this._narrow = e.matches;
      if (!e.matches && this._activeTab === 'changes') this._activeTab = 'agent';
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._mq.addEventListener('change', this._mqHandler);
  }

  firstUpdated() {
    this._initTerminal();
  }

  updated(changed) {
    if (changed.has('project') && this.project) {
      this._running = this.project.status === 'running';
      this._loadChanges();
      // Connect the terminal once the project arrives (terminal is already initialized)
      if (this._term && !this._termWs) this._connectWs();
    }
    if (changed.has('_activeTab')) {
      if (this._activeTab === 'agent') {
        requestAnimationFrame(() => this._termFit?.fit());
      }
      if (this._activeTab === 'changes') {
        this._inputOpen = false;
      }
    }
    if (changed.has('_inputOpen') && this._inputOpen) {
      requestAnimationFrame(() => {
        this.shadowRoot.querySelector('.mobile-input-textarea')?.focus();
      });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._mq?.removeEventListener('change', this._mqHandler);
    this._termDataDisposable?.dispose();
    this._termResizeDisposable?.dispose();
    this._termWs?.close();
    this._term?.dispose();
    this._term = null;
    this._termFit = null;
    this._termWs = null;
  }

  _initTerminal() {
    const el = this.shadowRoot.querySelector('#xterm-container');
    if (!el) return;
    this._term = new Terminal({
      cursorBlink: true,
      scrollback: 5000,
      fontFamily: '"Cascadia Code", ui-monospace, monospace',
      fontSize: 13,
    });
    this._termFit = new FitAddon();
    this._term.loadAddon(this._termFit);
    this._term.open(el);
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    this._term.loadAddon(webgl);
    this._termFit.fit();
    new ResizeObserver(() => this._termFit?.fit()).observe(el);

    this._term.attachCustomKeyEventHandler((e) => {
      // ctrl+c with selection: copy to clipboard instead of sending ^C
      if (e.type === 'keydown' && e.ctrlKey && e.key === 'c' && this._term.hasSelection()) {
        navigator.clipboard.writeText(this._term.getSelection()).catch(() => {});
        return false;
      }
      // ctrl+v: read from clipboard and paste into terminal
      if (e.type === 'keydown' && e.ctrlKey && e.key === 'v') {
        navigator.clipboard.readText().then(text => this._term.paste(text)).catch(() => {});
        return false;
      }
      return true;
    });

    this._connectWs();
  }

  _connectWs() {
    if (!this.project) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/projects/${this.project.id}/ws/agent`);
    ws.binaryType = 'arraybuffer';
    this._termWs = ws;

    ws.onopen = () => {
      this._termFit?.fit();
      const { cols, rows } = this._term;
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          this._termFit?.fit();
          const { cols, rows } = this._term;
          // HACK: Send Ctrl-L then a delayed resize to trigger a redraw on reconnect.
          // The Ctrl-L causes Claude Code to repaint the screen, and the resize nudges
          // the PTY into the correct dimensions after layout settles. A proper fix would
          // require full TTY output record/replay so reconnecting clients see current state.
          ws.send(JSON.stringify({ type: 'input', data: '\x0c' }));
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      }, 1000);
    };

    ws.onmessage = ({ data }) => {
      if (data instanceof ArrayBuffer) {
        this._term.write(new Uint8Array(data));
      } else {
        this._term.write(data);
      }
    };

    ws.onclose = () => {
      this._termWs = null;
      this._term?.write('\r\n\x1b[31m[Disconnected — reconnecting…]\x1b[0m\r\n');
      setTimeout(() => { if (this._term) this._connectWs(); }, 3000);
    };

    this._termDataDisposable?.dispose();
    this._termResizeDisposable?.dispose();

    this._termDataDisposable = this._term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    this._termResizeDisposable = this._term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });
  }

  async _loadChanges() {
    if (!this.project) return;
    this._loading = true;
    try {
      const [changesRes, remoteRes] = await Promise.all([
        fetch(`/api/projects/${this.project.id}/changes`),
        fetch(`/api/projects/${this.project.id}/remote-status`),
      ]);
      if (changesRes.ok) this._files = await changesRes.json();
      if (remoteRes.ok) this._remoteStatus = await remoteRes.json();
    } catch (e) {
      console.error('Failed to load changes', e);
    } finally {
      this._loading = false;
    }
  }

  async _saveIdentity() {
    if (!this._identityName.trim() || !this._identityEmail.trim()) return;
    this._savingIdentity = true;
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gitName: this._identityName.trim(), gitEmail: this._identityEmail.trim() }),
      });
      if (res.ok) {
        this._identityNeeded = false;
        // Retry the commit now that identity is set
        await this._commit();
      }
    } catch (e) {
      console.error('Failed to save identity', e);
    } finally {
      this._savingIdentity = false;
    }
  }

  async _sync() {
    if (!this.project || this._syncing) return;
    this._syncing = true;
    try {
      const res = await fetch(`/api/projects/${this.project.id}/sync`, { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        if (result.ok) {
          await this._loadChanges();
        }
      }
    } catch (e) {
      console.error('Failed to sync', e);
    } finally {
      this._syncing = false;
    }
  }

  _staged() { return this._files.filter(f => f.staged); }
  _unstaged() { return this._files.filter(f => !f.staged); }

  async _toggleStage(file) {
    if (!this.project) return;
    try {
      const res = await fetch(`/api/projects/${this.project.id}/changes/${file.id}/toggle`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated = await res.json();
        this._files = this._files.map(f => f.id === updated.id ? updated : f);
      }
    } catch (e) {
      // Optimistic update on failure
      this._files = this._files.map(f =>
        f.id === file.id ? { ...f, staged: !f.staged } : f
      );
    }
  }

  async _stageAll() {
    try {
      const res = await fetch(`/api/projects/${this.project.id}/changes/stage-all`, { method: 'POST' });
      if (res.ok) this._files = await res.json();
    } catch (e) {
      console.error('Failed to stage all', e);
    }
  }

  async _toggleRun() {
    if (!this.project) return;
    try {
      const res = await fetch(`/api/projects/${this.project.id}/run`, { method: 'POST' });
      if (res.ok) {
        const { status } = await res.json();
        this._running = status === 'running';
      }
    } catch (e) {
      this._running = !this._running;
    }
  }

  async _commit() {
    if (!this.project || !this._commitMsg.trim()) return;
    const staged = this._staged();
    if (staged.length === 0) return;
    this._committing = true;
    try {
      const res = await fetch(`/api/projects/${this.project.id}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: this._commitMsg.trim(),
          paths: staged.map(f => f.path),
        }),
      });
      const result = await res.json();
      if (res.ok && result.ok) {
        this._files = this._files.filter(f => !f.staged);
        this._commitMsg = '';
        this._committed = true;
        this._identityNeeded = false;
        setTimeout(() => this._committed = false, 2500);
        fetch(`/api/projects/${this.project.id}/remote-status`)
          .then(r => r.ok ? r.json() : null)
          .then(s => { if (s !== null) this._remoteStatus = s; });
      } else {
        const msg = result.error || 'commit failed';
        console.error('Commit failed:', msg);
        const isIdentityError = /user\.(name|email)|identity unknown|Please tell me who you are/i.test(msg);
        if (isIdentityError) {
          this._identityNeeded = true;
          this._identityName = '';
          this._identityEmail = '';
          // Pre-populate from saved config
          fetch('/api/config').then(r => r.ok ? r.json() : null).then(cfg => {
            if (cfg) { this._identityName = cfg.gitName || ''; this._identityEmail = cfg.gitEmail || ''; }
          });
        } else {
          this._commitError = msg;
          setTimeout(() => this._commitError = '', 5000);
        }
      }
    } finally {
      this._committing = false;
    }
  }

  _back() {
    this.dispatchEvent(new CustomEvent('navigate-home', { bubbles: true, composed: true }));
  }

  _sendEscape() {
    if (this._termWs?.readyState === WebSocket.OPEN) {
      this._termWs.send(JSON.stringify({ type: 'input', data: '\x1b' }));
    }
  }

  _sendMobileInput() {
    const text = this._mobileInput;
    if (!text.trim()) return;
    if (this._termWs?.readyState === WebSocket.OPEN) {
      this._termWs.send(JSON.stringify({ type: 'input', data: text + '\r' }));
    }
    this._mobileInput = '';
    this._inputOpen = false;
  }

  _pathParts(path) {
    const parts = path.split('/');
    const filename = parts.pop();
    const dir = parts.length > 0 ? parts.join('/') + '/' : '';
    return { dir, filename };
  }

  _renderFileRow(file) {
    const { dir, filename } = this._pathParts(file.path);
    return html`
      <div class="file-row" @click=${() => this._toggleStage(file)}>
        <div class="file-checkbox ${file.staged ? 'checked' : ''}">
          ${file.staged ? html`
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="m5 12 5 5L20 7"/>
            </svg>
          ` : ''}
        </div>
        <span class="status-badge status-${file.status}">${file.status}</span>
        <span class="file-path">
          <span class="dir">${dir}</span>${filename}
        </span>
        <span class="diff-stat">
          ${file.additions > 0 ? html`<span class="diff-add">+${file.additions}</span>` : ''}
          ${file.deletions > 0 ? html`<span class="diff-del">-${file.deletions}</span>` : ''}
        </span>
      </div>
    `;
  }

  _renderSidebar(asTab = false) {
    const staged = this._staged();
    const unstaged = this._unstaged();
    const allFiles = [...staged, ...unstaged];
    const branch = this.project?.branch || 'main';

    return html`
      <div class="sidebar ${asTab ? 'as-tab' : ''}">
        <div class="sidebar-top">
          <div class="run-row">
            <button class="run-btn ${this._running ? 'running' : 'idle'}" @click=${this._toggleRun}>
              ${this._running
                ? html`<span class="run-btn-pulse"></span>Stop`
                : html`${iconPlay} Run`
              }
            </button>
            <button class="chevron-btn">${iconChevronDown}</button>
          </div>
          ${this._running ? html`
            <div class="server-bar">
              <div class="server-info">
                <span class="server-dot"></span>
                <span>dev server</span>
                <span>·</span>
                <span class="server-link">localhost:3000</span>
              </div>
              <button class="icon-btn-sm" title="Open in browser">${iconExternal}</button>
            </div>
          ` : ''}
        </div>

        <div class="changes-section">
          <div class="section-header">
            <div class="section-title">
              Changes
              <span class="count-badge">${allFiles.length}</span>
            </div>
            <div class="section-actions">
              <button class="link-btn" @click=${this._stageAll}>Stage all</button>
              <button class="icon-btn-sm" title="Refresh" @click=${this._loadChanges}>${iconRefresh}</button>
            </div>
          </div>

          ${allFiles.length === 0 ? html`
            <div class="clean-state">
              ${this._committed ? html`
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--add)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;margin-bottom:4px;vertical-align:middle">
                  <path d="m5 12 5 5L20 7"/>
                </svg>
                Committed successfully
              ` : 'Working tree clean'}
            </div>
          ` : html`
            ${staged.length > 0 ? html`
              <div class="subhead">Staged</div>
              ${staged.map(f => this._renderFileRow(f))}
            ` : ''}
            ${unstaged.length > 0 ? html`
              <div class="subhead">Unstaged</div>
              ${unstaged.map(f => this._renderFileRow(f))}
            ` : ''}
          `}
        </div>

        <div class="commit-box">
          <textarea
            class="commit-textarea"
            placeholder="${staged.length > 0 ? 'Commit message…' : 'Stage files to commit'}"
            .value=${this._commitMsg}
            @input=${e => this._commitMsg = e.target.value}
            ?disabled=${staged.length === 0}
          ></textarea>
          ${this._commitError ? html`<div class="commit-error">${this._commitError}</div>` : ''}
          ${this._identityNeeded ? html`
            <div class="identity-card">
              <div class="identity-card-title">Git identity required</div>
              <div class="identity-card-sub">Set your name and email to commit.</div>
              <div class="identity-inputs">
                <input
                  class="identity-input"
                  type="text"
                  placeholder="Your name"
                  .value=${this._identityName}
                  @input=${e => this._identityName = e.target.value}
                  @keydown=${e => e.key === 'Enter' && this._saveIdentity()}
                />
                <input
                  class="identity-input"
                  type="email"
                  placeholder="you@example.com"
                  .value=${this._identityEmail}
                  @input=${e => this._identityEmail = e.target.value}
                  @keydown=${e => e.key === 'Enter' && this._saveIdentity()}
                />
              </div>
              <button
                class="identity-save-btn"
                ?disabled=${!this._identityName.trim() || !this._identityEmail.trim() || this._savingIdentity}
                @click=${this._saveIdentity}
              >${this._savingIdentity ? 'Saving…' : 'Save & commit'}</button>
            </div>
          ` : ''}
          <div class="commit-row">
            <div class="branch-indicator">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/>
                <path d="M6 7v10"/><path d="M18 11c0 3.5-3 5-6 5"/>
              </svg>
              ${branch}
              ${this._remoteStatus ? html`
                <span class="remote-counts">
                  ${this._remoteStatus.ahead > 0 ? html`<span class="remote-ahead">↑${this._remoteStatus.ahead}</span>` : ''}
                  ${this._remoteStatus.behind > 0 ? html`<span class="remote-behind">↓${this._remoteStatus.behind}</span>` : ''}
                </span>
              ` : ''}
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              ${this._remoteStatus ? html`
                <button
                  class="sync-btn"
                  ?disabled=${this._syncing}
                  @click=${this._sync}
                  title="Fetch, pull, and push"
                >${this._syncing ? 'Syncing…' : 'Sync'}</button>
              ` : ''}
              <button
                class="commit-btn"
                ?disabled=${staged.length === 0 || !this._commitMsg.trim() || this._committing}
                @click=${this._commit}
              >
                ${this._committing ? 'Committing…' : `Commit${staged.length > 0 ? ` ${staged.length}` : ''}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderTerminalPlaceholder() {
    return html`
      <div class="terminal-body">
        <div class="agent-tag">
          ${iconSparkle}
          claude agent · claude-sonnet-4-5
        </div>

        <div class="transcript-line">
          <div class="user-bubble">add a copy as markdown link command</div>
        </div>

        <div class="transcript-line">
          <div class="agent-think">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
            Reading Toolbar.tsx…
          </div>
        </div>

        <div class="transcript-line">
          <div style="display:flex;flex-direction:column;gap:4px">
            <span class="tool-badge tool-read">read · src/editor/Toolbar.tsx</span>
          </div>
        </div>

        <div class="transcript-line">
          <div class="agent-text">
            I'll add a "Copy as Markdown link" command to the toolbar. This will copy the current selection as a formatted Markdown link to the clipboard.<br/><br/>
            Let me update <code style="font-family:var(--font-mono);font-size:12px;background:var(--bg-3);padding:1px 5px;border-radius:3px">Toolbar.tsx</code> and create the <code style="font-family:var(--font-mono);font-size:12px;background:var(--bg-3);padding:1px 5px;border-radius:3px">insertLink.ts</code> command file.
          </div>
        </div>

        <div class="transcript-line">
          <div style="display:flex;flex-direction:column;gap:4px">
            <span class="tool-badge tool-write">write · src/editor/Toolbar.tsx</span>
            <span class="tool-badge tool-write">write · src/editor/commands/insertLink.ts</span>
          </div>
        </div>

        <div class="transcript-line">
          <div class="done-line">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m5 12 5 5L20 7"/>
            </svg>
            Done — 2 files updated, command added to toolbar
          </div>
        </div>

        <div class="transcript-line">
          <span class="cursor-blink"></span>
        </div>
      </div>
    `;
  }

  _renderLogsPlaceholder() {
    return html`
      <div class="terminal-body" style="color:var(--fg-3)">
        <div style="font-family:var(--font-mono);font-size:12px;line-height:1.8">
          <div><span style="color:var(--fg-3)">12:41:03</span> <span style="color:var(--add)">info</span>  Server started on port 3000</div>
          <div><span style="color:var(--fg-3)">12:41:03</span> <span style="color:var(--add)">info</span>  Watching for changes…</div>
          <div><span style="color:var(--fg-3)">12:41:47</span> <span style="color:var(--mod)">reload</span> src/editor/Toolbar.tsx</div>
          <div><span style="color:var(--fg-3)">12:41:47</span> <span style="color:var(--mod)">reload</span> src/editor/commands/insertLink.ts</div>
          <span class="cursor-blink"></span>
        </div>
      </div>
    `;
  }

  _renderShellPlaceholder() {
    return html`
      <div class="terminal-body" style="font-family:var(--font-mono);font-size:13px">
        <div style="color:var(--fg-2)"><span style="color:var(--accent)">❯</span> npm run dev</div>
        <div style="color:var(--fg-3)">  VITE v5.0.0  ready in 340 ms</div>
        <div style="color:var(--fg-3)">  ➜  Local:   <span style="color:var(--accent)">http://localhost:3000/</span></div>
        <div style="margin-top:12px;color:var(--fg-2)"><span style="color:var(--accent)">❯</span> <span class="cursor-blink"></span></div>
      </div>
    `;
  }

  render() {
    if (!this.project) return html`<div style="padding:40px;color:var(--fg-3)">Loading…</div>`;

    const tabs = this._narrow ? ['agent', 'logs', 'shell', 'changes'] : ['agent', 'logs', 'shell'];
    const changeCount = this._files.length;

    return html`
      ${this._narrow ? '' : html`
      <loop-top-bar>
        <div slot="breadcrumb">
          <button
            style="background:none;border:none;color:var(--fg-3);cursor:pointer;font-size:13px;font-family:var(--font-sans);display:flex;align-items:center;gap:5px;padding:0;transition:color 0.12s"
            @click=${this._back}
          >
            ${iconArrowLeft}
            Projects
          </button>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 6 6 6-6 6"/>
          </svg>
          <span style="color:var(--fg-1);font-size:13px;font-weight:500">${this.project.name}</span>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-family:var(--font-mono);color:var(--fg-2);background:var(--bg-3);border:1px solid var(--line-soft);border-radius:100px;padding:1px 8px;margin-left:6px">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/>
              <path d="M6 7v10"/><path d="M18 11c0 3.5-3 5-6 5"/>
            </svg>
            ${this.project.branch}
          </span>
        </div>
      </loop-top-bar>
      `}

      <div class="layout">
        ${this._narrow ? '' : this._renderSidebar()}

        <div class="main-area">
          <div class="tab-bar">
            <div class="tab-logo" @click=${this._back} title="Back to projects">
              <svg width="22" height="18" viewBox="0 0 26 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 10C13 7.5 11 4 7.5 4C4 4 2 6.5 2 9.5C2 13.5 5 16 8 16C11 16 13 13.5 13 10Z" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                <path d="M13 10C13 7.5 15 4 18.5 4C22 4 24 6.5 24 9.5C24 13.5 21 16 18 16C15 16 13 13.5 13 10Z" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
            </div>
            <div class="tabs">
              ${tabs.map(tab => html`
                <div
                  class="tab ${this._activeTab === tab ? 'active' : ''}"
                  @click=${() => this._activeTab = tab}
                >
                  ${tab}${tab === 'changes' && changeCount > 0 ? html` <span class="count-badge">${changeCount}</span>` : ''}
                </div>
              `)}
            </div>
            <div class="${this._running ? 'connection-chip' : 'connection-chip idle-chip'}">
              <span class="dot"></span>
              ${this._running ? 'connected' : 'idle'}
            </div>
          </div>

          <div class="terminal-body" style="display:${this._activeTab === 'agent' ? 'flex' : 'none'};padding:0;overflow:hidden">
            <div id="xterm-container"></div>
          </div>
          ${this._activeTab === 'logs' ? this._renderLogsPlaceholder() : ''}
          ${this._activeTab === 'shell' ? this._renderShellPlaceholder() : ''}
          ${this._narrow && this._activeTab === 'changes' ? this._renderSidebar(true) : ''}

        </div>
      </div>

      ${this._narrow && this._activeTab !== 'changes' ? html`
        ${this._inputOpen ? html`
          <div class="mobile-input-backdrop" @click=${() => this._inputOpen = false}></div>
          <div class="mobile-input-bar">
            <textarea
              class="mobile-input-textarea"
              placeholder="Send a message…"
              rows="1"
              .value=${this._mobileInput}
              @input=${e => this._mobileInput = e.target.value}
              @keydown=${e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendMobileInput(); } }}
            ></textarea>
            <button
              class="mobile-input-send"
              ?disabled=${!this._mobileInput.trim()}
              @click=${this._sendMobileInput}
            >${iconSend}</button>
          </div>
        ` : html`
          <button class="input-fab input-fab-stop" @click=${this._sendEscape}>${iconStop}</button>
          <button class="input-fab" @click=${() => this._inputOpen = true}>${iconPencil}</button>
        `}
      ` : ''}
    `;
  }
}

customElements.define('loop-project-screen', LoopProjectScreen);
