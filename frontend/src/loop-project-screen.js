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
import * as monaco from 'monaco-editor';
import monacoCSS from 'monaco-editor/min/vs/editor/editor.main.css?inline';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// Use the real editor worker for diff computation.
// Language-service workers (TS, JSON, CSS) are no-ops since we don't need intellisense.
window.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'editorWorkerService') return new EditorWorker();
    const blob = new Blob(['self.onmessage=function(){}'], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
  },
};

const LANG_MAP = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', mts: 'typescript',
  jsx: 'javascript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', cpp: 'cpp', cc: 'cpp', c: 'c', cs: 'csharp',
  php: 'php', swift: 'swift', kt: 'kotlin',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  json: 'json', jsonc: 'json',
  yaml: 'yaml', yml: 'yaml',
  md: 'markdown', mdx: 'markdown',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql', xml: 'xml', svg: 'xml',
  toml: 'ini', ini: 'ini', env: 'ini',
};

function detectLanguage(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
}

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
    _changesOpen: { state: true },
    _filesOpen: { state: true },
    _fileTree: { state: true },
    _filesLoading: { state: true },
    _expandedDirs: { state: true },
    _openFiles: { state: true },
    _openDiffs: { state: true },
    _dialog: { state: true },
    _ports: { state: true },
    _runMenuOpen: { state: true },
    _logEmpty: { state: true },
    _dragOverFiles: { state: true },
    _dropTargetDir: { state: true },
    _uploading: { state: true },
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
    .chevron-wrap {
      position: relative;
    }
    .run-menu {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      padding: 4px;
      min-width: 120px;
      z-index: 100;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    }
    .run-menu-item {
      width: 100%;
      text-align: left;
      padding: 6px 10px;
      border: none;
      background: transparent;
      color: var(--fg-1);
      font-size: 13px;
      font-family: var(--font-sans);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: background 0.1s;
    }
    .run-menu-item:hover { background: var(--bg-3); }
    .server-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-sm);
      padding: 6px 10px;
      text-decoration: none;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s;
    }
    .server-bar:hover {
      background: var(--bg-3);
      border-color: var(--accent);
    }
    .server-bar-icon {
      color: var(--fg-3);
      display: flex;
      align-items: center;
    }
    .server-bar:hover .server-bar-icon { color: var(--fg-1); }
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
    .server-dot.starting {
      background: oklch(0.85 0.18 90);
    }
    .server-bar-starting {
      cursor: default;
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

    /* Collapsible sections */
    .collapsible-section {
      flex-shrink: 0;
      border-top: 1px solid var(--line-soft);
    }
    .collapsible-section:first-of-type {
      border-top: none;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      cursor: pointer;
      user-select: none;
      background: var(--bg-0);
    }
    .section-header:hover { background: var(--bg-2); }
    .section-header-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-chevron {
      color: var(--fg-3);
      transition: transform 0.15s;
      flex-shrink: 0;
    }
    .section-chevron.open {
      transform: rotate(90deg);
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

    /* Changes section */
    .changes-section {
      flex-shrink: 0;
      min-height: 0;
      overflow-y: auto;
      padding: 0;
    }
    .changes-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px 6px;
      background: var(--bg-0);
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
    .file-row.no-diff { cursor: default; }
    .file-row.selected { background: var(--accent-soft); }
    .file-row.selected .file-path { color: var(--accent); }
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

    /* File tree */
    .file-tree {
      padding: 4px 0 8px;
    }
    .tree-node {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 3px 12px;
      cursor: default;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-1);
      overflow: hidden;
    }
    .tree-node:hover { background: var(--bg-2); }
    .tree-node-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .tree-dir-toggle {
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      width: 100%;
      gap: 5px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-1);
      text-align: left;
    }
    .tree-dir-chevron {
      color: var(--fg-3);
      flex-shrink: 0;
      transition: transform 0.12s;
    }
    .tree-dir-chevron.open {
      transform: rotate(90deg);
    }
    .tree-icon {
      flex-shrink: 0;
      color: var(--fg-3);
    }
    .tree-dir-icon { color: var(--accent); }
    .tree-empty {
      padding: 12px;
      text-align: center;
      color: var(--fg-3);
      font-size: 12px;
    }
    .file-tree.drag-over {
      background: oklch(0.84 0.18 130 / 0.05);
      outline: 2px dashed var(--accent);
      outline-offset: -4px;
      border-radius: 4px;
      min-height: 40px;
    }
    .tree-node.drop-target {
      background: var(--accent-soft);
      outline: 1px solid oklch(0.84 0.18 130 / 0.4);
      outline-offset: -1px;
      border-radius: 3px;
    }
    .upload-hint {
      padding: 6px 12px 8px;
      font-size: 11px;
      color: var(--accent);
      font-family: var(--font-sans);
      font-style: italic;
      pointer-events: none;
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
      width: 93%;
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
      padding: 5px 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--fg-3);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 0.12s;
      margin-bottom: -1px;
      white-space: nowrap;
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

    #monaco-container {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    #diff-container {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .diff-tab-badge {
      font-size: 9px;
      font-weight: 600;
      font-family: var(--font-mono);
      color: var(--mod);
      background: oklch(0.78 0.14 80 / 0.15);
      border-radius: 3px;
      padding: 0 3px;
      flex-shrink: 0;
    }
    .file-tab-name {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tab-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 3px;
      margin-left: 4px;
      color: var(--fg-3);
      transition: background 0.1s, color 0.1s;
    }
    .tab-close:hover {
      background: var(--bg-3);
      color: var(--fg-1);
    }
    .tree-node.selected {
      background: var(--accent-soft);
    }
    .tree-node.selected .tree-node-name {
      color: var(--accent);
    }

    /* File tabs */
    .tabs {
      overflow-x: auto;
      scrollbar-width: none;
      overflow-y: hidden;
    }
    .tabs::-webkit-scrollbar { display: none; }
    .file-tab {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      max-width: 160px;
    }
    .file-tab-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }
    .file-tab-dirty {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--fg-2);
      flex-shrink: 0;
    }
    .tab.active .file-tab-dirty { background: var(--accent); }
    .tab-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 3px;
      color: var(--fg-3);
      flex-shrink: 0;
      transition: background 0.1s, color 0.1s;
    }
    .tab-close:hover { background: var(--bg-3); color: var(--fg-1); }

    /* Dialog */
    .dialog-overlay {
      position: absolute;
      inset: 0;
      background: oklch(0 0 0 / 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .dialog-box {
      background: var(--bg-1);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 20px;
      width: 320px;
      max-width: calc(100vw - 32px);
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: 0 8px 32px oklch(0 0 0 / 0.4);
    }
    .dialog-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--fg-0);
    }
    .dialog-body {
      font-size: 13px;
      color: var(--fg-2);
      line-height: 1.5;
    }
    .dialog-body strong { color: var(--fg-1); }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .dialog-btn {
      padding: 6px 14px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      border: 1px solid var(--line-soft);
      background: var(--bg-2);
      color: var(--fg-1);
      transition: background 0.1s;
    }
    .dialog-btn:hover { background: var(--bg-3); }
    .dialog-btn-primary {
      background: var(--accent);
      color: var(--accent-fg);
      border-color: transparent;
    }
    .dialog-btn-primary:hover { opacity: 0.85; background: var(--accent); }
    .dialog-btn-danger {
      background: oklch(0.72 0.18 25 / 0.15);
      color: var(--del);
      border-color: oklch(0.72 0.18 25 / 0.3);
    }
    .dialog-btn-danger:hover { background: oklch(0.72 0.18 25 / 0.25); }

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
    /* Log view */
    .log-view {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: var(--bg-0);
    }
    .log-pre {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
      margin: 0;
      font-family: "Cascadia Code", ui-monospace, monospace;
      font-size: 12px;
      line-height: 1.6;
      color: var(--fg-1);
      white-space: pre-wrap;
      word-break: break-all;
    }
    .log-empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--fg-3);
      font-size: 13px;
      font-family: var(--font-sans);
    }
    .log-scroll-btn {
      position: absolute;
      bottom: 12px;
      right: 16px;
      background: var(--bg-3);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      color: var(--fg-2);
      font-size: 11px;
      font-family: var(--font-sans);
      padding: 4px 10px;
      cursor: pointer;
      z-index: 5;
      transition: background 0.1s;
    }
    .log-scroll-btn:hover { background: var(--bg-2); }

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
  `, unsafeCSS(xtermCss), unsafeCSS(monacoCSS)];

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
    this._changesOpen = true;
    this._filesOpen = true;
    this._fileTree = null;
    this._filesLoading = false;
    this._expandedDirs = new Set();
    this._openFiles = [];   // [{ path, dirty }]
    this._openDiffs = [];   // [{ tabId, path, staged }]
    this._ports = [];
    this._runMenuOpen = false;
    this._dialog = null;    // null | { type, ...data }
    this._logLines = [];
    this._logAutoScroll = true;
    this._logUpdated = false;
    this._logSse = null;
    this._logEmpty = true;
    this._dragOverFiles = false;
    this._dropTargetDir = null;
    this._uploading = false;
    this._fileModels = new Map();       // path -> monaco.ITextModel
    this._fileMtimes = new Map();       // path -> server mtime
    this._fileCleanVersions = new Map(); // path -> alternativeVersionId at last save/load
    this._fileChangeListeners = new Map(); // path -> IDisposable
    this._diffModels = new Map();       // tabId -> { original, modified } ITextModel pair
    this._monacoEditor = null;
    this._monacoDiffEditor = null;
    this._pollInterval = null;
    this._styleObserver = null;
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
      this._loadFileTree();
      this._connectSse();
      // Connect the terminal once the project arrives (terminal is already initialized)
      if (this._term && !this._termWs) this._connectWs();
    }
    if (changed.has('project') && this.project?.status === 'running') {
      this._fetchPorts();
    }
    if (changed.has('_running') && !this._running) {
      this._ports = [];
    }
    if (this._logUpdated) {
      this._logUpdated = false;
      if (this._logAutoScroll) {
        requestAnimationFrame(() => {
          const el = this.shadowRoot?.querySelector('.log-pre');
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    }
    if (changed.has('_activeTab')) {
      if (this._activeTab === 'logs') {
        this._connectLogs();
        this._logAutoScroll = true;
        requestAnimationFrame(() => {
          const el = this.shadowRoot?.querySelector('.log-pre');
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
      if (this._activeTab === 'agent') {
        requestAnimationFrame(() => this._termFit?.fit());
      }
      if (this._activeTab === 'changes') {
        this._inputOpen = false;
      }
      if (this._isFilePath(this._activeTab)) {
        this._ensureMonaco();
        if (this._monacoEditor) {
          this._monacoEditor.setModel(this._fileModels.get(this._activeTab) ?? null);
          requestAnimationFrame(() => this._monacoEditor?.layout());
        }
        this._startPolling(true);
      } else if (this._isDiffTab(this._activeTab)) {
        this._stopPolling();
        this._ensureMonacoDiff();
        if (this._monacoDiffEditor) {
          const models = this._diffModels.get(this._activeTab);
          if (models) this._monacoDiffEditor.setModel(models);
        }
      } else {
        this._stopPolling();
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
    this._sse?.close();
    this._sse = null;
    this._logSse?.close();
    this._logSse = null;
    this._termDataDisposable?.dispose();
    this._termResizeDisposable?.dispose();
    this._termWs?.close();
    this._term?.dispose();
    this._term = null;
    this._termFit = null;
    this._termWs = null;
    clearInterval(this._pollInterval);
    this._pollInterval = null;
    this._fileChangeListeners.forEach(d => d.dispose());
    this._fileChangeListeners.clear();
    this._fileModels.forEach(m => m.dispose());
    this._fileModels.clear();
    this._diffModels.forEach(({ original, modified }) => { original?.dispose(); modified?.dispose(); });
    this._diffModels.clear();
    this._monacoEditor?.dispose();
    this._monacoEditor = null;
    this._monacoDiffEditor?.dispose();
    this._monacoDiffEditor = null;
    this._styleObserver?.disconnect();
    this._styleObserver = null;
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

  async _loadFileTree() {
    if (!this.project) return;
    this._filesLoading = true;
    try {
      const res = await fetch(`/api/projects/${this.project.id}/files`);
      if (res.ok) this._fileTree = await res.json();
    } catch (e) {
      console.error('Failed to load file tree', e);
    } finally {
      this._filesLoading = false;
    }
  }

  async _uploadFiles(files, dirPath) {
    if (!files.length || !this.project) return;
    this._uploading = true;
    try {
      const uploads = await Promise.all(Array.from(files).map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return { name: file.name, content: btoa(binary) };
      }));
      await fetch(`/api/projects/${this.project.id}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: dirPath ?? '', files: uploads }),
      });
      await this._loadFileTree();
      this._loadChanges();
    } catch (e) {
      console.error('Upload failed', e);
    } finally {
      this._uploading = false;
    }
  }

  _onTreeDragOver(e, dirPath) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    this._dragOverFiles = true;
    this._dropTargetDir = dirPath;
  }

  _onTreeDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      this._dragOverFiles = false;
      this._dropTargetDir = null;
    }
  }

  _onTreeDrop(e) {
    e.preventDefault();
    const dir = this._dropTargetDir;
    this._dragOverFiles = false;
    this._dropTargetDir = null;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) this._uploadFiles(files, dir);
  }

  _connectSse() {
    this._sse?.close();
    this._sse = new EventSource(`/api/projects/${this.project.id}/events`);
    this._sse.addEventListener('changes', (e) => { this._files = JSON.parse(e.data); });
    this._sse.addEventListener('files', (e) => { this._fileTree = JSON.parse(e.data); });
    this._sse.addEventListener('status', (e) => { this._running = JSON.parse(e.data).status === 'running'; });
    this._sse.addEventListener('ports', (e) => { this._ports = JSON.parse(e.data); });
  }

  _connectLogs() {
    if (this._logSse || !this.project || !this.isConnected) return;
    this._logSse = new EventSource(`/api/projects/${this.project.id}/logs`);
    this._logSse.addEventListener('snapshot', (e) => {
      const text = JSON.parse(e.data);
      this._logLines = text ? text.split('\n') : [];
      this._logEmpty = this._logLines.length === 0;
      this._logUpdated = true;
      this.requestUpdate();
    });
    this._logSse.addEventListener('line', (e) => {
      this._logLines.push(JSON.parse(e.data));
      this._logEmpty = false;
      this._logUpdated = true;
      this.requestUpdate();
    });
    this._logSse.onerror = () => {
      this._logSse?.close();
      this._logSse = null;
      // Reconnect after a delay
      if (this.project) setTimeout(() => this._connectLogs(), 3000);
    };
  }

  _isFilePath(tab) {
    return !['agent', 'logs', 'shell', 'changes'].includes(tab) && !this._isDiffTab(tab);
  }

  _isDiffTab(tab) {
    return typeof tab === 'string' && tab.startsWith('diff:');
  }

  _diffTabId(path, staged) {
    return `diff:${staged ? 'staged' : 'unstaged'}:${path}`;
  }

  async _openFile(filePath) {
    // If already open, just switch to it
    if (this._fileModels.has(filePath)) {
      this._activeTab = filePath;
      return;
    }
    // Add tab immediately so the user sees it
    this._openFiles = [...this._openFiles, { path: filePath, dirty: false }];
    this._activeTab = filePath;

    try {
      const res = await fetch(`/api/projects/${this.project.id}/file?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        this._openFiles = this._openFiles.filter(f => f.path !== filePath);
        if (this._activeTab === filePath) this._activeTab = this._openFiles.at(-1)?.path ?? 'agent';
        return;
      }
      const { content, mtime } = await res.json();
      this._fileMtimes.set(filePath, mtime);

      const filename = filePath.split('/').pop() ?? filePath;
      const model = monaco.editor.createModel(content, detectLanguage(filename));
      this._fileModels.set(filePath, model);
      this._fileCleanVersions.set(filePath, model.getAlternativeVersionId());

      const listener = model.onDidChangeContent(() => {
        const isDirty = model.getAlternativeVersionId() !== this._fileCleanVersions.get(filePath);
        const entry = this._openFiles.find(f => f.path === filePath);
        if (entry && entry.dirty !== isDirty) {
          this._openFiles = this._openFiles.map(f => f.path === filePath ? { ...f, dirty: isDirty } : f);
        }
      });
      this._fileChangeListeners.set(filePath, listener);

      // Set model in editor if this is still the active file
      if (this._activeTab === filePath && this._monacoEditor) {
        this._monacoEditor.setModel(model);
        requestAnimationFrame(() => this._monacoEditor?.layout());
      }
    } catch (e) {
      console.error('Failed to load file', e);
    }
  }

  _closeFile(path, e) {
    e?.stopPropagation();
    const entry = this._openFiles.find(f => f.path === path);
    if (entry?.dirty) {
      this._dialog = { type: 'close-dirty', path };
    } else {
      this._confirmClose(path);
    }
  }

  _confirmClose(path) {
    this._fileChangeListeners.get(path)?.dispose();
    this._fileChangeListeners.delete(path);
    this._fileModels.get(path)?.dispose();
    this._fileModels.delete(path);
    this._fileMtimes.delete(path);
    this._fileCleanVersions.delete(path);
    const remaining = this._openFiles.filter(f => f.path !== path);
    this._openFiles = remaining;
    if (this._activeTab === path) {
      this._activeTab = remaining.length > 0 ? remaining.at(-1).path : 'agent';
    }
    this._dialog = null;
  }

  async _openDiff(file) {
    if (file.path.endsWith('/')) return;
    const tabId = this._diffTabId(file.path, file.staged);
    if (this._diffModels.has(tabId)) {
      this._activeTab = tabId;
      return;
    }
    // Add tab immediately
    if (!this._openDiffs.find(d => d.tabId === tabId)) {
      this._openDiffs = [...this._openDiffs, { tabId, path: file.path, staged: file.staged }];
    }
    this._activeTab = tabId;

    try {
      const params = new URLSearchParams({ path: file.path, staged: String(file.staged) });
      const res = await fetch(`/api/projects/${this.project.id}/diff?${params}`);
      if (!res.ok) { this._closeDiff(tabId); return; }
      const { original, modified } = await res.json();
      const lang = detectLanguage(file.path);
      const models = {
        original: monaco.editor.createModel(original, lang),
        modified: monaco.editor.createModel(modified, lang),
      };
      this._diffModels.set(tabId, models);
      if (this._activeTab === tabId) {
        this._ensureMonacoDiff();
        if (this._monacoDiffEditor) this._monacoDiffEditor.setModel(models);
      }
    } catch (e) {
      console.error('Failed to load diff', e);
      this._closeDiff(tabId);
    }
  }

  _closeDiff(tabId, e) {
    e?.stopPropagation();
    const models = this._diffModels.get(tabId);
    if (models) { models.original?.dispose(); models.modified?.dispose(); }
    this._diffModels.delete(tabId);
    const remaining = this._openDiffs.filter(d => d.tabId !== tabId);
    this._openDiffs = remaining;
    if (this._activeTab === tabId) {
      if (remaining.length > 0) this._activeTab = remaining.at(-1).tabId;
      else if (this._openFiles.length > 0) this._activeTab = this._openFiles.at(-1).path;
      else this._activeTab = 'agent';
    }
  }

  _ensureMonacoDiff() {
    const container = this.shadowRoot?.querySelector('#diff-container');
    if (!container) return;
    if (this._monacoDiffEditor) {
      const r = container.getBoundingClientRect();
      if (r.width && r.height) this._monacoDiffEditor.layout({ width: r.width, height: r.height });
      return;
    }
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) {
      requestAnimationFrame(() => this._ensureMonacoDiff());
      return;
    }
    this._monacoDiffEditor = monaco.editor.createDiffEditor(container, {
      theme: 'vs-dark',
      fontSize: 13,
      fontFamily: '"Cascadia Code", ui-monospace, monospace',
      fontLigatures: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      readOnly: true,
      renderSideBySide: true,
      ignoreTrimWhitespace: false,
    });
    this._monacoDiffEditor.layout({ width, height });
    new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      if (r.width && r.height) this._monacoDiffEditor?.layout({ width: r.width, height: r.height });
    }).observe(container);
    this._mirrorMonacoStyles();
    if (this._isDiffTab(this._activeTab)) {
      const models = this._diffModels.get(this._activeTab);
      if (models) this._monacoDiffEditor.setModel(models);
    }
  }

  async _saveFile(path, force = false) {
    const model = this._fileModels.get(path);
    if (!model) return;
    const content = model.getValue();
    const mtime = this._fileMtimes.get(path) ?? 0;
    try {
      const res = await fetch(
        `/api/projects/${this.project.id}/file?path=${encodeURIComponent(path)}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, mtime, force }) }
      );
      if (res.status === 409) {
        const { mtime: externalMtime } = await res.json();
        this._dialog = { type: 'save-conflict', path, externalMtime };
        return;
      }
      if (res.ok) {
        const { mtime: newMtime } = await res.json();
        this._fileMtimes.set(path, newMtime);
        this._fileCleanVersions.set(path, model.getAlternativeVersionId());
        this._openFiles = this._openFiles.map(f => f.path === path ? { ...f, dirty: false } : f);
        this._dialog = null;
        this._loadChanges();
      }
    } catch (e) {
      console.error('Failed to save file', e);
    }
  }

  _ensureMonaco() {
    const container = this.shadowRoot?.querySelector('#monaco-container');
    if (!container) return;
    if (this._monacoEditor) {
      requestAnimationFrame(() => this._monacoEditor.layout());
      return;
    }
    this._monacoEditor = monaco.editor.create(container, {
      model: null,
      theme: 'vs-dark',
      fontSize: 13,
      fontFamily: '"Cascadia Code", ui-monospace, monospace',
      fontLigatures: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: 'on',
      wordWrap: 'off',
      renderWhitespace: 'none',
      smoothScrolling: true,
    });
    new ResizeObserver(() => this._monacoEditor?.layout()).observe(container);
    this._monacoEditor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => { if (this._isFilePath(this._activeTab)) this._saveFile(this._activeTab); }
    );
    this._mirrorMonacoStyles();
  }

  // Monaco injects <style> into document.head at runtime (theme tokens etc).
  // Shadow DOM won't see those, so we mirror them into the shadow root.
  _mirrorMonacoStyles() {
    const root = this.shadowRoot;
    if (!root || this._styleObserver) return;
    const adopt = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'STYLE') return;
      if (!node.textContent?.includes('.monaco-')) return;
      const clone = node.cloneNode(true);
      root.appendChild(clone);
      new MutationObserver(() => { clone.textContent = node.textContent; })
        .observe(node, { childList: true, characterData: true, subtree: true });
    };
    document.head.querySelectorAll('style').forEach(adopt);
    this._styleObserver = new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach(adopt);
    });
    this._styleObserver.observe(document.head, { childList: true });
  }

  _startPolling(immediate = false) {
    clearInterval(this._pollInterval);
    if (immediate) this._pollFile();
    this._pollInterval = setInterval(() => this._pollFile(), 2000);
  }

  _stopPolling() {
    clearInterval(this._pollInterval);
    this._pollInterval = null;
  }

  async _pollFile() {
    const path = this._isFilePath(this._activeTab) ? this._activeTab : null;
    if (!this.project || !path) return;
    try {
      const res = await fetch(`/api/projects/${this.project.id}/file?path=${encodeURIComponent(path)}`);
      if (!res.ok) return;
      const { content, mtime } = await res.json();
      if (mtime === this._fileMtimes.get(path)) return;
      // Always update our stored mtime so save conflict detection works
      this._fileMtimes.set(path, mtime);
      const entry = this._openFiles.find(f => f.path === path);
      if (!entry?.dirty) {
        // Clean file: auto-reload
        const model = this._fileModels.get(path);
        if (model) {
          model.setValue(content);
          this._fileCleanVersions.set(path, model.getAlternativeVersionId());
        }
      }
      // If dirty: leave the model alone; save will show a conflict dialog
    } catch {
      // Silently ignore poll errors
    }
  }

  _renderDialog() {
    const d = this._dialog;
    if (!d) return '';
    if (d.type === 'close-dirty') {
      const filename = d.path.split('/').pop();
      return html`
        <div class="dialog-title">Unsaved Changes</div>
        <div class="dialog-body">Save changes to <strong>${filename}</strong> before closing?</div>
        <div class="dialog-actions">
          <button class="dialog-btn" @click=${() => this._dialog = null}>Cancel</button>
          <button class="dialog-btn dialog-btn-danger" @click=${() => this._confirmClose(d.path)}>Discard</button>
          <button class="dialog-btn dialog-btn-primary" @click=${async () => {
            await this._saveFile(d.path);
            if (!this._dialog) this._confirmClose(d.path);
          }}>Save</button>
        </div>
      `;
    }
    if (d.type === 'save-conflict') {
      const filename = d.path.split('/').pop();
      return html`
        <div class="dialog-title">File Changed Externally</div>
        <div class="dialog-body"><strong>${filename}</strong> was modified since you opened it. Overwrite with your changes?</div>
        <div class="dialog-actions">
          <button class="dialog-btn" @click=${() => this._dialog = null}>Cancel</button>
          <button class="dialog-btn dialog-btn-danger" @click=${() => this._saveFile(d.path, true)}>Overwrite</button>
        </div>
      `;
    }
    return '';
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

  async _fetchPorts() {
    if (!this.project) return;
    try {
      const res = await fetch(`/api/projects/${this.project.id}/ports`);
      if (res.ok) this._ports = await res.json();
    } catch { /* ignore */ }
  }

  _toggleRunMenu(e) {
    e.stopPropagation();
    if (this._runMenuOpen) {
      this._runMenuOpen = false;
      return;
    }
    this._runMenuOpen = true;
    const close = () => {
      this._runMenuOpen = false;
      document.removeEventListener('click', close);
    };
    document.addEventListener('click', close);
  }

  async _restartRun() {
    this._runMenuOpen = false;
    if (!this.project) return;
    this._ports = [];
    try {
      await fetch(`/api/projects/${this.project.id}/restart`, { method: 'POST' });
    } catch { /* ignore */ }
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
    const isDir = file.path.endsWith('/');
    const tabId = this._diffTabId(file.path, file.staged);
    const isActive = this._activeTab === tabId;
    return html`
      <div class="file-row ${isActive ? 'selected' : ''} ${isDir ? 'no-diff' : ''}" @click=${() => this._openDiff(file)}>
        <div class="file-checkbox ${file.staged ? 'checked' : ''}"
          @click=${(e) => { e.stopPropagation(); this._toggleStage(file); }}>
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

  _toggleDir(path) {
    const next = new Set(this._expandedDirs);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this._expandedDirs = next;
  }

  _renderTreeNodes(nodes, depth = 0, parentPath = '') {
    const indent = depth * 14;
    return nodes.map(node => {
      const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
      if (node.type === 'dir') {
        const open = this._expandedDirs.has(nodePath);
        const isDropTarget = this._dropTargetDir === nodePath;
        return html`
          <div class="tree-node ${isDropTarget ? 'drop-target' : ''}" style="padding-left:${12 + indent}px"
            @dragover=${(e) => this._onTreeDragOver(e, nodePath)}
          >
            <button class="tree-dir-toggle" @click=${(e) => { e.stopPropagation(); this._toggleDir(nodePath); }}>
              <svg class="tree-dir-chevron ${open ? 'open' : ''}" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 6 6 6-6 6"/>
              </svg>
              <svg class="tree-icon tree-dir-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>
              </svg>
              <span class="tree-node-name">${node.name}</span>
            </button>
          </div>
          ${open ? this._renderTreeNodes(node.children, depth + 1, nodePath) : ''}
        `;
      } else {
        const isSelected = this._activeTab === nodePath || this._openFiles.some(f => f.path === nodePath);
        return html`
          <div
            class="tree-node ${isSelected ? 'selected' : ''}"
            style="padding-left:${12 + indent + 15}px;cursor:pointer"
            @click=${() => this._openFile(nodePath)}
          >
            <svg class="tree-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span class="tree-node-name">${node.name}</span>
          </div>
        `;
      }
    });
  }

  _renderSidebar(asTab = false) {
    const staged = this._staged();
    const unstaged = this._unstaged();
    const allFiles = [...staged, ...unstaged];
    const branch = this.project?.branch || 'main';

    return html`
      <div class="sidebar ${asTab ? 'as-tab' : ''}">
        <div class="sidebar-top">
          ${this.project?.hasCompose ? html`
            <div class="run-row">
              <button class="run-btn ${this._running ? 'running' : 'idle'}" @click=${this._toggleRun}>
                ${this._running
                  ? html`<span class="run-btn-pulse"></span>Stop`
                  : html`${iconPlay} Run`
                }
              </button>
              <div class="chevron-wrap">
                <button class="chevron-btn" @click=${this._toggleRunMenu}>${iconChevronDown}</button>
                ${this._runMenuOpen ? html`
                  <div class="run-menu">
                    <button class="run-menu-item" @click=${this._restartRun}>Restart</button>
                  </div>
                ` : ''}
              </div>
            </div>
            ${this._running ? html`
              ${this._ports.length ? html`
                <a class="server-bar"
                  href="http://${window.location.hostname}:${this._ports[0].hostPort}"
                  target="_blank" rel="noopener noreferrer">
                  <div class="server-info">
                    <span class="server-dot"></span>
                    <span>dev server</span>
                    <span>·</span>
                    <span class="server-link">${window.location.hostname}:${this._ports[0].hostPort}</span>
                  </div>
                  <span class="server-bar-icon">${iconExternal}</span>
                </a>
              ` : html`
                <div class="server-bar server-bar-starting">
                  <div class="server-info">
                    <span class="server-dot starting"></span>
                    <span>dev server</span>
                    <span>·</span>
                    <span>starting…</span>
                  </div>
                </div>
              `}
            ` : ''}
          ` : ''}
        </div>

        <div class="collapsible-section">
          <div class="section-header" @click=${() => this._changesOpen = !this._changesOpen}>
            <div class="section-header-left">
              <svg class="section-chevron ${this._changesOpen ? 'open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 6 6 6-6 6"/>
              </svg>
              <div class="section-title">
                Changes
                ${allFiles.length > 0 ? html`<span class="count-badge">${allFiles.length}</span>` : ''}
              </div>
            </div>
            <div class="section-actions" @click=${e => e.stopPropagation()}>
              <button class="link-btn" @click=${this._stageAll}>Stage all</button>
              <button class="icon-btn-sm" title="Refresh" @click=${this._loadChanges}>${iconRefresh}</button>
            </div>
          </div>

          ${this._changesOpen ? html`
            <div class="changes-section">
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
          ` : ''}
        </div>

        <div class="collapsible-section">
          <div class="section-header" @click=${() => { if (!this._filesOpen) this._loadFileTree(); this._filesOpen = !this._filesOpen; }}>
            <div class="section-header-left">
              <svg class="section-chevron ${this._filesOpen ? 'open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 6 6 6-6 6"/>
              </svg>
              <div class="section-title">Files</div>
            </div>
            <div class="section-actions" @click=${e => e.stopPropagation()}>
              <button class="icon-btn-sm" title="Refresh" @click=${this._loadFileTree}>${iconRefresh}</button>
            </div>
          </div>

          ${this._filesOpen ? html`
            <div class="file-tree ${this._dragOverFiles ? 'drag-over' : ''}"
              @dragover=${(e) => this._onTreeDragOver(e, null)}
              @dragleave=${(e) => this._onTreeDragLeave(e)}
              @drop=${(e) => this._onTreeDrop(e)}
            >
              ${this._filesLoading ? html`<div class="tree-empty">Loading…</div>` :
                !this._fileTree || this._fileTree.length === 0
                  ? html`<div class="tree-empty">${this._dragOverFiles ? 'Drop to upload' : 'No files'}</div>`
                  : this._renderTreeNodes(this._fileTree)
              }
              ${this._dragOverFiles ? html`
                <div class="upload-hint">
                  ${this._dropTargetDir
                    ? `Drop to upload into ${this._dropTargetDir}/`
                    : 'Drop to upload to project root'
                  }
                </div>
              ` : ''}
              ${this._uploading ? html`<div class="tree-empty">Uploading…</div>` : ''}
            </div>
          ` : ''}
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

  _onLogScroll(e) {
    const el = e.target;
    this._logAutoScroll = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }

  _scrollLogsToBottom() {
    const el = this.shadowRoot?.querySelector('.log-pre');
    if (el) { el.scrollTop = el.scrollHeight; this._logAutoScroll = true; }
  }

  _renderLogs() {
    const logText = this._logLines.join('\n');
    return html`
      <div class="log-view" style="position:relative">
        ${this._logEmpty
          ? html`<div class="log-empty">No logs yet — start the container to see output</div>`
          : html`<pre class="log-pre" @scroll=${this._onLogScroll}>${logText}</pre>`
        }
        ${!this._logAutoScroll && !this._logEmpty ? html`
          <button class="log-scroll-btn" @click=${this._scrollLogsToBottom}>↓ Follow</button>
        ` : ''}
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

    const baseTabs = this._narrow ? ['agent', 'logs', 'shell', 'changes'] : ['agent', 'logs', 'shell'];
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
              ${baseTabs.map(tab => html`
                <div
                  class="tab ${this._activeTab === tab ? 'active' : ''}"
                  @click=${() => this._activeTab = tab}
                >
                  ${tab === 'changes' ? 'project' : tab}${tab === 'changes' && changeCount > 0 ? html` <span class="count-badge">${changeCount}</span>` : ''}
                </div>
              `)}
              ${this._openFiles.map(({ path, dirty }) => {
                const filename = path.split('/').pop();
                return html`
                  <div
                    class="tab file-tab ${this._activeTab === path ? 'active' : ''}"
                    @click=${() => this._activeTab = path}
                    @auxclick=${(e) => e.button === 1 && this._closeFile(path, e)}
                  >
                    <span class="file-tab-name">${filename}</span>
                    ${dirty ? html`<span class="file-tab-dirty" title="Unsaved changes"></span>` : ''}
                    <span class="tab-close" @click=${(e) => this._closeFile(path, e)}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 6 6 18M6 6l12 12"/>
                      </svg>
                    </span>
                  </div>
                `;
              })}
              ${this._openDiffs.map(({ tabId, path }) => {
                const filename = path.split('/').pop();
                return html`
                  <div
                    class="tab file-tab ${this._activeTab === tabId ? 'active' : ''}"
                    @click=${() => this._activeTab = tabId}
                    @auxclick=${(e) => e.button === 1 && this._closeDiff(tabId, e)}
                  >
                    <span class="file-tab-name">${filename}</span>
                    <span class="diff-tab-badge">diff</span>
                    <span class="tab-close" @click=${(e) => this._closeDiff(tabId, e)}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 6 6 18M6 6l12 12"/>
                      </svg>
                    </span>
                  </div>
                `;
              })}
            </div>
            <div class="${this._running ? 'connection-chip' : 'connection-chip idle-chip'}">
              <span class="dot"></span>
              ${this._running ? 'connected' : 'idle'}
            </div>
          </div>

          <div class="terminal-body" style="display:${this._activeTab === 'agent' ? 'flex' : 'none'};padding:0;overflow:hidden">
            <div id="xterm-container"></div>
          </div>
          <div style="display:${this._activeTab === 'logs' ? 'flex' : 'none'};flex:1;min-height:0">
            ${this._activeTab === 'logs' || this._logSse ? this._renderLogs() : ''}
          </div>
          ${this._activeTab === 'shell' ? this._renderShellPlaceholder() : ''}
          ${this._narrow && this._activeTab === 'changes' ? this._renderSidebar(true) : ''}
          <div id="monaco-container" style="display:${this._isFilePath(this._activeTab) ? 'flex' : 'none'};flex:1;min-height:0"></div>
          <div id="diff-container" style="display:${this._isDiffTab(this._activeTab) ? 'flex' : 'none'};flex:1;min-height:0"></div>

        </div>
      </div>

      ${this._dialog ? html`
        <div class="dialog-overlay" @click=${() => this._dialog = null}>
          <div class="dialog-box" @click=${e => e.stopPropagation()}>
            ${this._renderDialog()}
          </div>
        </div>
      ` : ''}

      ${this._narrow && this._activeTab !== 'changes' && !this._isFilePath(this._activeTab) ? html`
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
