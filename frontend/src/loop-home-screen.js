import { LitElement, html, css } from 'lit';
import './loop-top-bar.js';
import {
  iconPlus, iconSearch, iconGrid, iconList, iconGit, iconBranch, iconChevron,
  iconMore, iconTrash, iconFolder, iconFolderPlus, iconPencil
} from './icons.js';

// Which folders / projects the viewer has collapsed on the home screen.
const COLLAPSED_KEY = 'loop.home.collapsed';

const _isMac = /Macintosh|MacIntel/.test(navigator.userAgent);
const _isMobile = window.matchMedia('(pointer: coarse)').matches;
const _modKey = _isMac ? '⌘' : 'Ctrl-';

class LoopHomeScreen extends LitElement {
  static properties = {
    projects: { type: Array },
    _search: { state: true },
    _viewMode: { state: true },
    _sortKey: { state: true },
    _sortDir: { state: true },
    _menuFor: { state: true },
    _dialog: { state: true },
    _deleting: { state: true },
    _folders: { state: true },
    _collapsed: { state: true },
    _dragId: { state: true },
    _dropTarget: { state: true },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
      background: var(--bg-0);
    }
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 32px 40px;
    }
    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    .page-title-group {}
    .page-title {
      font-size: 22px;
      font-weight: 600;
      color: var(--fg-0);
      margin-bottom: 4px;
    }
    .page-subtitle {
      font-size: 13px;
      color: var(--fg-2);
    }
    .page-subtitle span {
      color: var(--fg-1);
      font-weight: 500;
    }
    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: opacity 0.12s;
      white-space: nowrap;
    }
    .btn-primary:hover {
      opacity: 0.9;
    }
    .header-actions {
      display: flex;
      gap: 8px;
    }
    .btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: var(--bg-2);
      color: var(--fg-1);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 500;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
      white-space: nowrap;
    }
    .btn-secondary:hover {
      background: var(--bg-3);
      color: var(--fg-0);
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }
    .search-wrap {
      flex: 1;
      position: relative;
      max-width: 380px;
    }
    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--fg-3);
      display: flex;
      pointer-events: none;
    }
    .search-input {
      width: 100%;
      height: 34px;
      box-sizing: border-box;
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      color: var(--fg-0);
      font-family: var(--font-sans);
      font-size: 13px;
      padding: 0 56px 0 34px;
      outline: none;
      transition: border-color 0.12s;
    }
    .search-input::placeholder { color: var(--fg-3); }
    .search-input:focus { border-color: var(--accent); }
    @media (pointer: coarse) {
      .search-input { padding-right: 10px; }
      .search-shortcut { display: none; }
    }
    .search-shortcut {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 11px;
      color: var(--fg-3);
      background: var(--bg-3);
      border: 1px solid var(--line-soft);
      border-radius: 4px;
      padding: 1px 5px;
      font-family: var(--font-mono);
    }
    .view-toggle {
      display: flex;
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .view-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border: none;
      background: transparent;
      color: var(--fg-2);
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
    }
    .view-btn.active {
      background: var(--bg-3);
      color: var(--fg-0);
    }
    .view-btn:hover:not(.active) {
      background: var(--bg-hover);
      color: var(--fg-1);
    }

    /* Grid */
    .project-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }
    .new-card {
      border: 1.5px dashed var(--line);
      border-radius: var(--radius);
      min-height: 160px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      color: var(--fg-3);
      font-size: 13px;
      font-weight: 500;
      background: transparent;
      transition: border-color 0.12s, color 0.12s, background 0.12s;
    }
    .new-card:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: var(--accent-soft);
    }
    .new-card-icon {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 1.5px dashed currentColor;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .project-card {
      background: var(--bg-1);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      padding: 16px;
      cursor: pointer;
      transition: border-color 0.12s, background 0.12s;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 160px;
    }
    .project-card:hover {
      border-color: var(--line);
      background: var(--bg-2);
    }
    .card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .card-glyph {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-sm);
      background: var(--accent-soft);
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      font-family: var(--font-sans);
      flex-shrink: 0;
      letter-spacing: -0.03em;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 100px;
      border: 1px solid transparent;
    }
    .status-pill.running {
      background: oklch(0.84 0.18 130 / 0.12);
      color: var(--accent);
      border-color: oklch(0.84 0.18 130 / 0.25);
    }
    .status-pill.idle {
      background: var(--bg-3);
      color: var(--fg-2);
      border-color: var(--line-soft);
    }
    .status-pill.error {
      background: oklch(0.72 0.18 25 / 0.12);
      color: var(--del);
      border-color: oklch(0.72 0.18 25 / 0.25);
    }
    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      animation: pulseDot 2s ease-in-out infinite;
    }
    .static-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.6;
    }
    .card-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--fg-0);
    }
    .card-repo {
      font-size: 11px;
      color: var(--fg-3);
      font-family: var(--font-mono);
      margin-top: 1px;
    }
    .card-desc {
      font-size: 12px;
      color: var(--fg-2);
      line-height: 1.5;
      flex: 1;
    }
    .card-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .branch-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--fg-2);
      background: var(--bg-3);
      border: 1px solid var(--line-soft);
      border-radius: 100px;
      padding: 1px 7px;
    }
    .changes-badge {
      font-size: 11px;
      color: var(--mod);
      font-weight: 500;
    }
    .last-activity {
      font-size: 11px;
      color: var(--fg-3);
      margin-left: auto;
    }

    /* List view */
    .project-table {
      width: 100%;
      border-collapse: collapse;
    }
    .project-table th {
      text-align: left;
      font-size: 11px;
      font-weight: 500;
      color: var(--fg-3);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 8px 12px;
      border-bottom: 1px solid var(--line-soft);
      white-space: nowrap;
    }
    .project-table th.sortable {
      cursor: pointer;
      user-select: none;
      transition: color 0.1s;
    }
    .project-table th.sortable:hover { color: var(--fg-1); }
    .project-table th.sorted { color: var(--fg-0); }
    .sort-arrow {
      display: inline-block;
      margin-left: 4px;
      font-size: 9px;
      line-height: 1;
    }
    .project-table th.sortable:not(.sorted) .sort-arrow { opacity: 0; }
    .project-table th.sortable:hover .sort-arrow { opacity: 0.5; }
    .project-table th.sorted .sort-arrow { opacity: 1; }
    .project-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line-soft);
      font-size: 13px;
    }
    .project-table tr {
      cursor: pointer;
      transition: background 0.1s;
    }
    .project-table tr:hover td {
      background: var(--bg-2);
    }
    .table-name {
      font-weight: 500;
      color: var(--fg-0);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .table-glyph {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      background: var(--accent-soft);
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--fg-3);
      font-size: 14px;
    }

    /* Workstreams */
    .ws-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-top: 8px;
      border-top: 1px solid var(--line-soft);
    }
    .ws-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--fg-2);
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: 100px;
      padding: 2px 8px;
      cursor: pointer;
      max-width: 100%;
      transition: color 0.12s, border-color 0.12s;
    }
    .ws-pill:hover { color: var(--fg-0); border-color: var(--accent); }
    .ws-pill svg { width: 10px; height: 10px; flex-shrink: 0; }
    .ws-pill-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ws-pill-count { color: var(--mod); font-weight: 500; }
    .ws-row td { color: var(--fg-2); }
    .ws-name {
      font-weight: 400;
      color: var(--fg-2);
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .ws-indent {
      display: inline-flex;
      color: var(--fg-3);
    }
    .ws-indent svg { width: 12px; height: 12px; }

    /* Folders & tree */
    .tree-toggle, .tree-spacer {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }
    .tree-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--fg-3);
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
    }
    .tree-toggle:hover { background: var(--bg-3); color: var(--fg-1); }
    .tree-toggle svg { width: 14px; height: 14px; transition: transform 0.12s; }
    .tree-toggle.open svg { transform: rotate(90deg); }
    .folder-glyph {
      display: flex;
      color: var(--fg-2);
    }
    .folder-row td { background: var(--bg-1); }
    .folder-row .table-name { font-weight: 600; }
    .folder-count {
      font-size: 11px;
      font-weight: 400;
      color: var(--fg-3);
    }
    .project-table tr.drop-target td,
    .folder-section.drop-target .folder-header {
      background: var(--accent-soft);
      box-shadow: inset 0 0 0 1px var(--accent);
    }
    .project-table tr.dragging td,
    .project-card.dragging { opacity: 0.4; }
    .empty-folder-row td {
      color: var(--fg-3);
      font-size: 12px;
      font-style: italic;
      cursor: default;
    }
    .project-table tr.empty-folder-row:hover td { background: transparent; }
    .folder-section { margin-bottom: 16px; }
    .folder-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      margin-bottom: 10px;
      border-radius: var(--radius);
      cursor: pointer;
      user-select: none;
      transition: background 0.1s;
    }
    .folder-header:hover { background: var(--bg-2); }
    .folder-header-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--fg-0);
    }
    .folder-header .menu-wrap { margin-left: auto; }
    .folder-empty {
      border: 1.5px dashed var(--line);
      border-radius: var(--radius);
      padding: 20px;
      text-align: center;
      color: var(--fg-3);
      font-size: 12px;
    }
    .root-dropzone {
      border: 1.5px dashed var(--line);
      border-radius: var(--radius);
      padding: 12px;
      margin-bottom: 12px;
      text-align: center;
      color: var(--fg-3);
      font-size: 12px;
      transition: border-color 0.1s, background 0.1s, color 0.1s;
    }
    .root-dropzone.drop-target {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent);
    }

    /* "..." menu */
    .menu-wrap {
      position: relative;
      flex-shrink: 0;
    }
    .menu-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      border: none;
      background: transparent;
      color: var(--fg-3);
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
    }
    .menu-btn:hover { background: var(--bg-3); color: var(--fg-1); }
    .menu-btn.active { background: var(--bg-3); color: var(--fg-1); }
    .table-menu-cell { width: 40px; text-align: right; }
    .ctx-menu {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      padding: 4px;
      min-width: 160px;
      z-index: 50;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
    .ctx-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
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
    .ctx-menu-item:hover { background: var(--bg-3); }
    .ctx-menu-item svg { width: 14px; height: 14px; flex-shrink: 0; }
    .ctx-menu-item.danger { color: var(--del); }
    .ctx-menu-sep {
      height: 1px;
      margin: 4px 0;
      background: var(--line-soft);
    }
    .ctx-menu-label {
      padding: 4px 10px 2px;
      font-size: 11px;
      color: var(--fg-3);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    /* Delete dialog */
    .dialog-overlay {
      position: fixed;
      inset: 0;
      background: oklch(0 0 0 / 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
    }
    .dialog-box {
      background: var(--bg-1);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 20px;
      width: 360px;
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
    .dialog-warning {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background: oklch(0.72 0.18 25 / 0.1);
      border: 1px solid oklch(0.72 0.18 25 / 0.25);
      color: var(--del);
      font-size: 12px;
      line-height: 1.5;
    }
    .dialog-input {
      height: 34px;
      box-sizing: border-box;
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-sm);
      color: var(--fg-0);
      font-family: var(--font-sans);
      font-size: 13px;
      padding: 0 10px;
      outline: none;
    }
    .dialog-input:focus { border-color: var(--accent); }
    .dialog-btn-primary {
      background: var(--accent);
      color: var(--accent-fg);
      border-color: transparent;
    }
    .dialog-btn-primary:hover:not(:disabled) { background: var(--accent); opacity: 0.9; }
    .dialog-error {
      font-size: 11px;
      color: var(--del);
      line-height: 1.4;
      word-break: break-word;
    }
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
    .dialog-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .dialog-btn-danger {
      background: oklch(0.72 0.18 25 / 0.15);
      color: var(--del);
      border-color: oklch(0.72 0.18 25 / 0.3);
    }
    .dialog-btn-danger:hover:not(:disabled) { background: oklch(0.72 0.18 25 / 0.25); }
  `;

  constructor() {
    super();
    this.projects = [];
    this._search = '';
    this._viewMode = 'grid';
    this._sortKey = 'lastActivity';   // 'name' | 'status' | 'changes' | 'lastActivity'
    this._sortDir = 'desc';           // 'asc' | 'desc'
    this._menuFor = null;   // project id whose "..." menu is open
    this._dialog = null;    // null | { type: 'delete-project' | 'folder-name' | 'delete-folder', ... }
    this._deleting = false;
    this._folders = [];
    this._collapsed = this._loadCollapsed();  // Set of 'f:<folderId>' / 'p:<projectId>'
    this._dragId = null;      // project id being dragged
    this._dropTarget = null;  // folder id under the drag, '' for top level, null for none
    this._boundKeydown = this._handleKeydown.bind(this);
    this._boundCloseMenu = () => { if (this._menuFor) this._menuFor = null; };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._boundKeydown);
    document.addEventListener('click', this._boundCloseMenu);
    this._fetchFolders();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._boundKeydown);
    document.removeEventListener('click', this._boundCloseMenu);
  }

  updated(changed) {
    if (changed.has('_dialog') && this._dialog?.type === 'folder-name' && changed.get('_dialog')?.type !== 'folder-name') {
      const input = this.shadowRoot.querySelector('.dialog-input');
      input?.focus();
      input?.select();
    }
  }

  _handleKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      this.shadowRoot.querySelector('.search-input')?.focus();
    }
  }

  // Only top-level projects are listed; workstreams are rendered as sub-rows
  // under their parent (see _workstreamsOf).
  _filtered() {
    const roots = this.projects.filter(p => !p.parentId);
    if (!this._search.trim()) return roots;
    const q = this._search.toLowerCase();
    const matches = p =>
      p.name.toLowerCase().includes(q) ||
      (p.repo || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q);
    // A project stays visible when one of its workstreams matches, so searching
    // for a workstream name still leads you to it.
    return roots.filter(p => matches(p) || this._workstreamsOf(p.id).some(ws => ws.workstream.toLowerCase().includes(q)));
  }

  _workstreamsOf(projectId) {
    return this.projects.filter(p => p.parentId === projectId);
  }

  // The folder a top-level project is shown in — null for the top level,
  // including a stale folderId whose folder no longer exists.
  _folderOf(p) {
    return p.folderId && this._folders.some(f => f.id === p.folderId) ? p.folderId : null;
  }

  // Split the (search-filtered) projects into folder groups plus the ungrouped
  // rest. Empty folders stay visible so projects can be dragged into them, but
  // while searching a folder only shows up if it or one of its projects matches
  // (a folder-name match shows all of its projects).
  _groups(filtered) {
    const q = this._search.trim().toLowerCase();
    const matched = new Set(filtered.map(p => p.id));
    const roots = this.projects.filter(p => !p.parentId);
    const folders = this._folders.map(folder => {
      const all = roots.filter(p => this._folderOf(p) === folder.id);
      const nameHit = !!q && folder.name.toLowerCase().includes(q);
      return { folder, nameHit, projects: nameHit ? all : all.filter(p => matched.has(p.id)) };
    }).filter(g => !q || g.nameHit || g.projects.length > 0);
    const ungrouped = filtered.filter(p => !this._folderOf(p));
    return { folders, ungrouped };
  }

  // A folder's row in the list sorts and summarises like a project: running if
  // anything in it runs, total changes, most recent activity.
  _folderSummary(folder, projects) {
    const all = projects.flatMap(p => [p, ...this._workstreamsOf(p.id)]);
    const status = all.some(p => p.status === 'running') ? 'running'
      : all.some(p => p.status === 'error') ? 'error' : 'idle';
    const lastActivity = all.reduce((max, p) => {
      const t = new Date(p.lastActivity).getTime();
      return Number.isNaN(t) || t < max ? max : t;
    }, 0);
    return {
      name: folder.name,
      status,
      changes: all.reduce((n, p) => n + (p.changes || 0), 0),
      lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
    };
  }

  // --- Collapse state ---------------------------------------------------------
  // Everything starts expanded; the viewer's collapsed folders/projects are
  // remembered in localStorage. A search expands everything so matches show.

  _loadCollapsed() {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'));
    } catch {
      return new Set();
    }
  }

  _isCollapsed(key) {
    return !this._search.trim() && this._collapsed.has(key);
  }

  _toggleCollapsed(e, key) {
    e?.stopPropagation();
    const next = new Set(this._collapsed);
    if (!next.delete(key)) next.add(key);
    this._collapsed = next;
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch { /* storage unavailable — collapse state just won't persist */ }
  }

  _renderToggle(key, hasChildren) {
    if (!hasChildren) return html`<span class="tree-spacer"></span>`;
    const open = !this._isCollapsed(key);
    return html`
      <button
        class="tree-toggle ${open ? 'open' : ''}"
        title=${open ? 'Collapse' : 'Expand'}
        @click=${e => this._toggleCollapsed(e, key)}
      >${iconChevron}</button>
    `;
  }

  // --- Folders ------------------------------------------------------------------

  async _fetchFolders() {
    try {
      const res = await fetch('/api/folders');
      if (res.ok) this._folders = await res.json();
    } catch (e) {
      console.warn('Could not fetch folders', e);
    }
  }

  _sortedFolderGroups(groups) {
    const withSummary = groups.map(g => ({ ...g, summary: this._folderSummary(g.folder, g.projects) }));
    const order = this._sorted(withSummary.map(g => g.summary));
    return order.map(sum => withSummary.find(g => g.summary === sum));
  }

  _openNewFolderDialog() {
    this._dialog = { type: 'folder-name', folder: null, name: '' };
  }

  _openRenameFolderDialog(e, folder) {
    e.stopPropagation();
    this._menuFor = null;
    this._dialog = { type: 'folder-name', folder, name: folder.name };
  }

  _openDeleteFolderDialog(e, folder) {
    e.stopPropagation();
    this._menuFor = null;
    const count = this.projects.filter(p => !p.parentId && this._folderOf(p) === folder.id).length;
    this._dialog = { type: 'delete-folder', folder, count };
  }

  async _saveFolderName() {
    const d = this._dialog;
    const name = (d?.name || '').trim();
    if (!name || this._deleting) return;
    this._deleting = true;
    try {
      const res = d.folder
        ? await fetch(`/api/folders/${d.folder.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          })
        : await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save folder');
      this._folders = d.folder
        ? this._folders.map(f => f.id === body.id ? body : f)
        : [...this._folders, body];
      this._dialog = null;
    } catch (e) {
      console.error('Failed to save folder', e);
      this._dialog = { ...this._dialog, error: e.message };
    } finally {
      this._deleting = false;
    }
  }

  // Deleting a folder keeps its projects: the backend moves them to the top level.
  async _deleteFolder() {
    const folder = this._dialog?.folder;
    if (!folder || this._deleting) return;
    this._deleting = true;
    try {
      const res = await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete folder');
      }
      this._folders = this._folders.filter(f => f.id !== folder.id);
      for (const p of this.projects.filter(p => p.folderId === folder.id)) {
        this._emitProjectUpdate(p.id, { folderId: null });
      }
      this._dialog = null;
    } catch (e) {
      console.error('Failed to delete folder', e);
      this._dialog = { ...this._dialog, error: e.message };
    } finally {
      this._deleting = false;
    }
  }

  _emitProjectUpdate(id, patch) {
    this.dispatchEvent(new CustomEvent('project-updated', {
      detail: { id, ...patch },
      bubbles: true,
      composed: true,
    }));
  }

  // Optimistic: the project moves right away and moves back if the save fails.
  async _moveToFolder(id, folderId) {
    const project = this.projects.find(p => p.id === id);
    if (!project || project.parentId) return;
    const prev = this._folderOf(project);
    if (prev === (folderId || null)) return;
    this._emitProjectUpdate(id, { folderId: folderId || null });
    try {
      const res = await fetch(`/api/projects/${id}/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folderId || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to move project');
      }
    } catch (e) {
      console.error('Failed to move project', e);
      this._emitProjectUpdate(id, { folderId: prev });
    }
  }

  // --- Drag and drop ------------------------------------------------------------
  // Top-level projects drag; folders (and any row or card inside one) are drop
  // targets, as is the top level ('' — its rows/cards and the "move out" zone).

  _onDragStart(e, p) {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', p.id);
    this._menuFor = null;
    // Defer so the browser snapshots the drag image before the row dims.
    requestAnimationFrame(() => { this._dragId = p.id; });
  }

  _onDragEnd() {
    this._dragId = null;
    this._dropTarget = null;
  }

  _onDragOver(e, folderId) {
    const dragged = this._dragId && this.projects.find(p => p.id === this._dragId);
    if (!dragged) return;
    e.stopPropagation();
    // Not calling preventDefault leaves the drop disallowed — nothing to do when
    // the project is already there.
    if (this._folderOf(dragged) === (folderId || null)) {
      this._dropTarget = null;
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this._dropTarget = folderId;
  }

  _onDrop(e, folderId) {
    e.preventDefault();
    e.stopPropagation();
    const id = this._dragId;
    this._onDragEnd();
    if (id) this._moveToFolder(id, folderId);
  }

  // Sorting is a view concern only — it reorders top-level rows and, within each
  // project, its workstream sub-rows (which always stay attached to their parent).
  static _statusRank = { running: 0, stopping: 1, cloning: 2, error: 3, idle: 4 };

  // Clicking a column sorts by it; clicking the active column flips direction.
  // Each column starts in its most useful direction (newest / most changes /
  // running first, but names A→Z).
  _toggleSort(key) {
    if (this._sortKey === key) {
      this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._sortKey = key;
      this._sortDir = (key === 'name' || key === 'status') ? 'asc' : 'desc';
    }
  }

  _sortValue(p, key) {
    switch (key) {
      case 'name': return (p.workstream || p.name || '').toLowerCase();
      case 'status': return LoopHomeScreen._statusRank[p.status] ?? 9;
      case 'changes': return p.changes || 0;
      case 'lastActivity': {
        const t = new Date(p.lastActivity).getTime();
        return Number.isNaN(t) ? 0 : t;
      }
      default: return 0;
    }
  }

  _sorted(rows) {
    const key = this._sortKey;
    const sign = this._sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = this._sortValue(a, key);
      const vb = this._sortValue(b, key);
      if (va < vb) return -sign;
      if (va > vb) return sign;
      // Stable tie-break on name so equal statuses/changes keep a predictable order.
      const na = (a.workstream || a.name || '').toLowerCase();
      const nb = (b.workstream || b.name || '').toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
  }

  _sortHeader(key, label) {
    const active = this._sortKey === key;
    return html`
      <th
        class="sortable ${active ? 'sorted' : ''}"
        title="Sort by ${label.toLowerCase()}"
        @click=${() => this._toggleSort(key)}
      >${label}<span class="sort-arrow">${active && this._sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span></th>
    `;
  }

  _glyph(name) {
    return name.slice(0, 2).toUpperCase();
  }

  _relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
  }

  _navigateNew() {
    this.dispatchEvent(new CustomEvent('navigate-new', { bubbles: true, composed: true }));
  }

  _navigateProject(id) {
    this.dispatchEvent(new CustomEvent('navigate-project', {
      detail: { id },
      bubbles: true,
      composed: true,
    }));
  }

  _toggleMenu(e, id) {
    e.stopPropagation();
    this._menuFor = this._menuFor === id ? null : id;
  }

  _openDeleteDialog(e, project) {
    e.stopPropagation();
    this._menuFor = null;
    const reasons = [];
    if (project.changes > 0) {
      reasons.push(`has ${project.changes} uncommitted change${project.changes === 1 ? '' : 's'}`);
    }
    const workstreams = this._workstreamsOf(project.id);
    if (workstreams.length > 0) {
      reasons.push(`has ${workstreams.length} workstream${workstreams.length === 1 ? '' : 's'} that will be deleted too`);
    }
    this._dialog = { type: 'delete-project', project, reasons };
    this._addUnpushedReason(project.id);
  }

  // Unpushed commits need a git call, so they arrive after the dialog opens and
  // are folded into the warning then. A failed check stays silent — the generic
  // "this cannot be recovered" wording already covers it.
  async _addUnpushedReason(id) {
    try {
      const res = await fetch(`/api/projects/${id}/deletion-impact`);
      if (!res.ok) return;
      const { commits = 0 } = await res.json();
      if (commits === 0) return;
      const d = this._dialog;
      if (d?.type !== 'delete-project' || d.project?.id !== id) return;
      this._dialog = {
        ...d,
        reasons: [`has ${commits} commit${commits === 1 ? '' : 's'} that ${commits === 1 ? 'is' : 'are'} not on any remote`, ...d.reasons],
      };
    } catch (e) {
      console.warn('Could not check for unpushed work', e);
    }
  }

  async _deleteProject() {
    const project = this._dialog?.project;
    if (!project || this._deleting) return;
    this._deleting = true;
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete project');
      }
      this._dialog = null;
      this.dispatchEvent(new CustomEvent('project-deleted', {
        // We're already on the home screen — no need to navigate.
        detail: { id: project.id, stay: true },
        bubbles: true,
        composed: true,
      }));
    } catch (e) {
      console.error('Failed to delete project', e);
      this._dialog = { ...this._dialog, error: e.message };
    } finally {
      this._deleting = false;
    }
  }

  _renderMenu(p) {
    return html`
      <div class="menu-wrap" @click=${e => e.stopPropagation()}>
        <button
          class="menu-btn ${this._menuFor === p.id ? 'active' : ''}"
          title="More actions"
          @click=${e => this._toggleMenu(e, p.id)}
        >${iconMore}</button>
        ${this._menuFor === p.id ? html`
          <div class="ctx-menu">
            ${this._renderMoveItems(p)}
            <button class="ctx-menu-item danger" @click=${e => this._openDeleteDialog(e, p)}>
              ${iconTrash}
              Delete ${p.parentId ? 'workstream' : 'project'}
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  // "Move to" entries in a project's menu — the non-drag way to file a project
  // (and the only one on touch devices).
  _renderMoveItems(p) {
    if (p.parentId) return '';
    const current = this._folderOf(p);
    const targets = this._folders.filter(f => f.id !== current);
    if (targets.length === 0 && !current) return '';
    const move = (e, folderId) => {
      e.stopPropagation();
      this._menuFor = null;
      this._moveToFolder(p.id, folderId);
    };
    return html`
      <div class="ctx-menu-label">Move to</div>
      ${targets.map(f => html`
        <button class="ctx-menu-item" @click=${e => move(e, f.id)}>${iconFolder}${f.name}</button>
      `)}
      ${current ? html`
        <button class="ctx-menu-item" @click=${e => move(e, null)}>${iconList}Top level</button>
      ` : ''}
      <div class="ctx-menu-sep"></div>
    `;
  }

  _renderFolderMenu(folder) {
    const key = `folder:${folder.id}`;
    return html`
      <div class="menu-wrap" @click=${e => e.stopPropagation()}>
        <button
          class="menu-btn ${this._menuFor === key ? 'active' : ''}"
          title="Folder actions"
          @click=${e => this._toggleMenu(e, key)}
        >${iconMore}</button>
        ${this._menuFor === key ? html`
          <div class="ctx-menu">
            <button class="ctx-menu-item" @click=${e => this._openRenameFolderDialog(e, folder)}>
              ${iconPencil}
              Rename folder
            </button>
            <button class="ctx-menu-item danger" @click=${e => this._openDeleteFolderDialog(e, folder)}>
              ${iconTrash}
              Delete folder
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderFolderNameDialog() {
    const d = this._dialog;
    if (d?.type !== 'folder-name') return '';
    const renaming = !!d.folder;
    const close = () => { if (!this._deleting) this._dialog = null; };
    return html`
      <div class="dialog-overlay" @click=${close}>
        <div class="dialog-box" @click=${e => e.stopPropagation()}>
          <div class="dialog-title">${renaming ? 'Rename folder' : 'New folder'}</div>
          <input
            class="dialog-input"
            type="text"
            placeholder="Folder name"
            .value=${d.name}
            @input=${e => this._dialog = { ...this._dialog, name: e.target.value, error: null }}
            @keydown=${e => {
              if (e.key === 'Enter') this._saveFolderName();
              else if (e.key === 'Escape') close();
            }}
          />
          ${d.error ? html`<div class="dialog-error">${d.error}</div>` : ''}
          <div class="dialog-actions">
            <button class="dialog-btn" @click=${close} ?disabled=${this._deleting}>Cancel</button>
            <button
              class="dialog-btn dialog-btn-primary"
              @click=${this._saveFolderName}
              ?disabled=${this._deleting || !d.name.trim()}
            >${renaming ? 'Rename' : 'Create folder'}</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderDeleteFolderDialog() {
    const d = this._dialog;
    if (d?.type !== 'delete-folder') return '';
    const close = () => { if (!this._deleting) this._dialog = null; };
    return html`
      <div class="dialog-overlay" @click=${close}>
        <div class="dialog-box" @click=${e => e.stopPropagation()}>
          <div class="dialog-title">Delete folder</div>
          <div class="dialog-body">
            Delete the folder <strong>${d.folder.name}</strong>?
            ${d.count > 0
              ? html`Its ${d.count} project${d.count === 1 ? '' : 's'} will move back to the top level — no projects are deleted.`
              : 'It is empty.'}
          </div>
          ${d.error ? html`<div class="dialog-error">${d.error}</div>` : ''}
          <div class="dialog-actions">
            <button class="dialog-btn" @click=${close} ?disabled=${this._deleting}>Cancel</button>
            <button class="dialog-btn dialog-btn-danger" @click=${this._deleteFolder} ?disabled=${this._deleting}>
              ${this._deleting ? 'Deleting…' : 'Delete folder'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  _renderDeleteDialog() {
    const d = this._dialog;
    if (!d || d.type !== 'delete-project') return '';
    const isWorkstream = !!d.project?.parentId;
    const kind = isWorkstream ? 'workstream' : 'project';
    const name = (isWorkstream ? d.project.workstream : d.project?.name) || `this ${kind}`;
    const hasWarning = d.reasons && d.reasons.length > 0;
    return html`
      <div class="dialog-overlay" @click=${() => { if (!this._deleting) this._dialog = null; }}>
        <div class="dialog-box" @click=${e => e.stopPropagation()}>
          <div class="dialog-title">Delete ${kind}</div>
          <div class="dialog-body">
            Delete <strong>${name}</strong>? This permanently removes the ${kind} and its files from the server.
            ${hasWarning ? html`
              <div class="dialog-warning">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div>
                  This ${kind} ${d.reasons.join(' and ')}. Deleting it will permanently lose that work — it cannot be recovered.
                </div>
              </div>
            ` : ''}
          </div>
          ${d.error ? html`<div class="dialog-error">${d.error}</div>` : ''}
          <div class="dialog-actions">
            <button class="dialog-btn" @click=${() => this._dialog = null} ?disabled=${this._deleting}>Cancel</button>
            <button class="dialog-btn dialog-btn-danger" @click=${this._deleteProject} ?disabled=${this._deleting}>
              ${this._deleting ? 'Deleting…' : `Delete ${kind}`}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  _renderStatusPill(status) {
    if (status === 'running') {
      return html`<span class="status-pill running"><span class="pulse-dot"></span>running</span>`;
    } else if (status === 'error') {
      return html`<span class="status-pill error"><span class="static-dot"></span>error</span>`;
    }
    return html`<span class="status-pill idle"><span class="static-dot"></span>idle</span>`;
  }

  // Workstreams shown under their project — an isolated repo copy + sandbox
  // per branch, so each is entered on its own.
  _renderWorkstreamStrip(p) {
    const workstreams = this._workstreamsOf(p.id);
    if (workstreams.length === 0) return '';
    return html`
      <div class="ws-strip" @click=${e => e.stopPropagation()}>
        ${workstreams.map(ws => html`
          <button class="ws-pill" title="Open workstream ${ws.workstream}" @click=${() => this._navigateProject(ws.id)}>
            ${iconBranch}
            <span class="ws-pill-name">${ws.workstream}</span>
            ${ws.status === 'running' ? html`<span class="pulse-dot"></span>` : ''}
            ${ws.changes > 0 ? html`<span class="ws-pill-count">${ws.changes}</span>` : ''}
          </button>
        `)}
      </div>
    `;
  }

  _renderCard(p) {
    const folderId = this._folderOf(p) || '';
    return html`
      <div
        class="project-card ${this._dragId === p.id ? 'dragging' : ''}"
        draggable="true"
        @dragstart=${e => this._onDragStart(e, p)}
        @dragend=${this._onDragEnd}
        @dragover=${e => this._onDragOver(e, folderId)}
        @drop=${e => this._onDrop(e, folderId)}
        @click=${() => this._navigateProject(p.id)}
      >
        <div class="card-top">
          <div>
            <div class="card-glyph">${this._glyph(p.name)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:4px">
            ${this._renderStatusPill(p.status)}
            ${this._renderMenu(p)}
          </div>
        </div>
        <div>
          <div class="card-name">${p.name}</div>
          <div class="card-repo">${p.repo}</div>
        </div>
        <div class="card-desc">${p.description}</div>
        <div class="card-meta">
          <span class="branch-chip">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/>
              <path d="M6 7v10"/><path d="M18 11c0 3.5-3 5-6 5"/>
            </svg>
            ${p.branch}
          </span>
          ${p.changes > 0 ? html`<span class="changes-badge">${p.changes} changes</span>` : ''}
          <span class="last-activity">${this._relativeTime(p.lastActivity)}</span>
        </div>
        ${this._renderWorkstreamStrip(p)}
      </div>
    `;
  }

  // While a filed project is being dragged, a zone to drop it back to the top level.
  _renderRootDropzone() {
    const dragged = this._dragId && this.projects.find(p => p.id === this._dragId);
    if (!dragged || !this._folderOf(dragged)) return '';
    return html`
      <div
        class="root-dropzone ${this._dropTarget === '' ? 'drop-target' : ''}"
        @dragover=${e => this._onDragOver(e, '')}
        @drop=${e => this._onDrop(e, '')}
      >Drop here to move out of the folder</div>
    `;
  }

  _renderGrid({ folders, ungrouped }) {
    return html`
      ${this._renderRootDropzone()}
      ${this._sortedFolderGroups(folders).map(({ folder, projects }) => {
        const key = `f:${folder.id}`;
        const open = !this._isCollapsed(key);
        return html`
          <div
            class="folder-section ${this._dropTarget === folder.id ? 'drop-target' : ''}"
            @dragover=${e => this._onDragOver(e, folder.id)}
            @drop=${e => this._onDrop(e, folder.id)}
          >
            <div class="folder-header" @click=${e => this._toggleCollapsed(e, key)}>
              ${this._renderToggle(key, true)}
              <span class="folder-glyph">${iconFolder}</span>
              <span class="folder-header-name">${folder.name}</span>
              <span class="folder-count">${projects.length}</span>
              ${this._renderFolderMenu(folder)}
            </div>
            ${open ? (projects.length > 0 ? html`
              <div class="project-grid">
                ${this._sorted(projects).map(p => this._renderCard(p))}
              </div>
            ` : html`<div class="folder-empty">Empty — drag projects here</div>`) : ''}
          </div>
        `;
      })}
      <div class="project-grid">
        <div class="new-card" @click=${this._navigateNew}>
          <div class="new-card-icon">${iconPlus}</div>
          <span>New project</span>
        </div>
        ${this._sorted(ungrouped).map(p => this._renderCard(p))}
      </div>
    `;
  }

  _branchChip(branch) {
    return html`
      <span class="branch-chip">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/>
          <path d="M6 7v10"/><path d="M18 11c0 3.5-3 5-6 5"/>
        </svg>
        ${branch}
      </span>
    `;
  }

  _changesCell(changes) {
    return changes > 0
      ? html`<span class="changes-badge">${changes} changes</span>`
      : html`<span style="color:var(--fg-3)">—</span>`;
  }

  // Tree depth → left padding of the name cell.
  _indent(level) {
    return `padding-left:${12 + level * 22}px`;
  }

  // A project row, then (unless collapsed) its workstream rows one level deeper.
  _renderProjectRows(p, level) {
    const folderId = this._folderOf(p) || '';
    const workstreams = this._workstreamsOf(p.id);
    const key = `p:${p.id}`;
    const drop = {
      over: e => this._onDragOver(e, folderId),
      drop: e => this._onDrop(e, folderId),
    };
    return html`
      <tr
        class=${this._dragId === p.id ? 'dragging' : ''}
        draggable="true"
        @dragstart=${e => this._onDragStart(e, p)}
        @dragend=${this._onDragEnd}
        @dragover=${drop.over}
        @drop=${drop.drop}
        @click=${() => this._navigateProject(p.id)}
      >
        <td style=${this._indent(level)}>
          <div class="table-name">
            ${this._renderToggle(key, workstreams.length > 0)}
            <div class="table-glyph">${this._glyph(p.name)}</div>
            ${p.name}
          </div>
        </td>
        <td>${this._branchChip(p.branch)}</td>
        <td>${this._renderStatusPill(p.status)}</td>
        <td>${this._changesCell(p.changes)}</td>
        <td style="color:var(--fg-3)">${this._relativeTime(p.lastActivity)}</td>
        <td class="table-menu-cell">${this._renderMenu(p)}</td>
      </tr>
      ${this._isCollapsed(key) ? '' : this._sorted(workstreams).map(ws => html`
        <tr class="ws-row" @dragover=${drop.over} @drop=${drop.drop} @click=${() => this._navigateProject(ws.id)}>
          <td style=${this._indent(level + 1)}>
            <div class="table-name ws-name">
              <span class="tree-spacer"></span>
              <span class="ws-indent">${iconBranch}</span>
              ${ws.workstream}
            </div>
          </td>
          <td>${this._branchChip(ws.branch)}</td>
          <td>${this._renderStatusPill(ws.status)}</td>
          <td>${this._changesCell(ws.changes)}</td>
          <td style="color:var(--fg-3)">${this._relativeTime(ws.lastActivity)}</td>
          <td class="table-menu-cell">${this._renderMenu(ws)}</td>
        </tr>
      `)}
    `;
  }

  _renderList({ folders, ungrouped }) {
    return html`
      ${this._renderRootDropzone()}
      <table class="project-table">
        <thead>
          <tr>
            ${this._sortHeader('name', 'Name')}
            <th>Branch</th>
            ${this._sortHeader('status', 'Status')}
            ${this._sortHeader('changes', 'Changes')}
            ${this._sortHeader('lastActivity', 'Last activity')}
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${this._sortedFolderGroups(folders).map(({ folder, projects, summary }) => {
            const key = `f:${folder.id}`;
            const over = e => this._onDragOver(e, folder.id);
            const drop = e => this._onDrop(e, folder.id);
            return html`
              <tr
                class="folder-row ${this._dropTarget === folder.id ? 'drop-target' : ''}"
                @dragover=${over}
                @drop=${drop}
                @click=${e => this._toggleCollapsed(e, key)}
              >
                <td style=${this._indent(0)}>
                  <div class="table-name">
                    ${this._renderToggle(key, true)}
                    <span class="folder-glyph">${iconFolder}</span>
                    ${folder.name}
                    <span class="folder-count">${projects.length}</span>
                  </div>
                </td>
                <td></td>
                <td>${summary.status === 'idle' ? '' : this._renderStatusPill(summary.status)}</td>
                <td>${this._changesCell(summary.changes)}</td>
                <td style="color:var(--fg-3)">${summary.lastActivity ? this._relativeTime(summary.lastActivity) : ''}</td>
                <td class="table-menu-cell">${this._renderFolderMenu(folder)}</td>
              </tr>
              ${this._isCollapsed(key) ? '' : projects.length === 0 ? html`
                <tr class="empty-folder-row" @dragover=${over} @drop=${drop}>
                  <td colspan="6" style=${this._indent(1)}>Empty — drag projects here</td>
                </tr>
              ` : this._sorted(projects).map(p => this._renderProjectRows(p, 1))}
            `;
          })}
          ${this._sorted(ungrouped).map(p => this._renderProjectRows(p, 0))}
        </tbody>
      </table>
    `;
  }

  render() {
    const groups = this._groups(this._filtered());
    const running = this.projects.filter(p => p.status === 'running').length;
    const changed = this.projects.filter(p => p.changes > 0).length;
    const workstreams = this.projects.filter(p => p.parentId).length;

    return html`
      <loop-top-bar></loop-top-bar>
      <div class="content" @dragover=${() => { if (this._dragId) this._dropTarget = null; }}>
        <div class="page-header">
          <div class="page-title-group">
            <div class="page-title">Projects</div>
            <div class="page-subtitle">
              <span>${this.projects.filter(p => !p.parentId).length}</span> total ·
              ${workstreams > 0 ? html`<span>${workstreams}</span> workstream${workstreams === 1 ? '' : 's'} · ` : ''}
              <span>${running}</span> running ·
              <span>${changed}</span> with changes
            </div>
          </div>
          <div class="header-actions">
            <button class="btn-secondary" @click=${this._openNewFolderDialog}>
              ${iconFolderPlus}
              New folder
            </button>
            <button class="btn-primary" @click=${this._navigateNew}>
              ${iconPlus}
              New project
            </button>
          </div>
        </div>
        <div class="toolbar">
          <div class="search-wrap">
            <div class="search-icon">${iconSearch}</div>
            <input
              class="search-input"
              type="text"
              placeholder="Search projects..."
              .value=${this._search}
              @input=${e => this._search = e.target.value}
            />
            <span class="search-shortcut">${_modKey}K</span>
          </div>
          <div class="view-toggle">
            <button class="view-btn ${this._viewMode === 'grid' ? 'active' : ''}" @click=${() => this._viewMode = 'grid'} title="Grid view">
              ${iconGrid}
            </button>
            <button class="view-btn ${this._viewMode === 'list' ? 'active' : ''}" @click=${() => this._viewMode = 'list'} title="List view">
              ${iconList}
            </button>
          </div>
        </div>
        ${groups.folders.length === 0 && groups.ungrouped.length === 0 && this._search
          ? html`<div class="empty-state">No projects match "${this._search}"</div>`
          : this._viewMode === 'grid' ? this._renderGrid(groups) : this._renderList(groups)
        }
      </div>
      ${this._renderDeleteDialog()}
      ${this._renderFolderNameDialog()}
      ${this._renderDeleteFolderDialog()}
    `;
  }
}

customElements.define('loop-home-screen', LoopHomeScreen);
