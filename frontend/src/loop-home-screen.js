import { LitElement, html, css } from 'lit';
import './loop-top-bar.js';
import {
  iconPlus, iconSearch, iconGrid, iconList, iconGit, iconBranch, iconChevron,
  iconMore, iconTrash
} from './icons.js';

const _isMac = /Macintosh|MacIntel/.test(navigator.userAgent);
const _isMobile = window.matchMedia('(pointer: coarse)').matches;
const _modKey = _isMac ? '⌘' : 'Ctrl-';

class LoopHomeScreen extends LitElement {
  static properties = {
    projects: { type: Array },
    _search: { state: true },
    _viewMode: { state: true },
    _menuFor: { state: true },
    _dialog: { state: true },
    _deleting: { state: true },
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
    }
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
    .ctx-menu-item.danger { color: var(--del); }
    .ctx-menu-item.danger svg { width: 14px; height: 14px; }

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
    this._menuFor = null;   // project id whose "..." menu is open
    this._dialog = null;    // null | { type: 'delete-project', project, error }
    this._deleting = false;
    this._boundKeydown = this._handleKeydown.bind(this);
    this._boundCloseMenu = () => { if (this._menuFor) this._menuFor = null; };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._boundKeydown);
    document.addEventListener('click', this._boundCloseMenu);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._boundKeydown);
    document.removeEventListener('click', this._boundCloseMenu);
  }

  _handleKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      this.shadowRoot.querySelector('.search-input')?.focus();
    }
  }

  _filtered() {
    if (!this._search.trim()) return this.projects;
    const q = this._search.toLowerCase();
    return this.projects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.repo || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
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
    this._dialog = { type: 'delete-project', project, reasons };
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
        detail: { id: project.id },
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
            <button class="ctx-menu-item danger" @click=${e => this._openDeleteDialog(e, p)}>
              ${iconTrash}
              Delete project
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderDeleteDialog() {
    const d = this._dialog;
    if (!d || d.type !== 'delete-project') return '';
    const name = d.project?.name || 'this project';
    const hasWarning = d.reasons && d.reasons.length > 0;
    return html`
      <div class="dialog-overlay" @click=${() => { if (!this._deleting) this._dialog = null; }}>
        <div class="dialog-box" @click=${e => e.stopPropagation()}>
          <div class="dialog-title">Delete project</div>
          <div class="dialog-body">
            Delete <strong>${name}</strong>? This permanently removes the project and its files from the server.
            ${hasWarning ? html`
              <div class="dialog-warning">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div>
                  This project ${d.reasons.join(' and ')}. Deleting it will permanently lose that work — it cannot be recovered.
                </div>
              </div>
            ` : ''}
          </div>
          ${d.error ? html`<div class="dialog-error">${d.error}</div>` : ''}
          <div class="dialog-actions">
            <button class="dialog-btn" @click=${() => this._dialog = null} ?disabled=${this._deleting}>Cancel</button>
            <button class="dialog-btn dialog-btn-danger" @click=${this._deleteProject} ?disabled=${this._deleting}>
              ${this._deleting ? 'Deleting…' : 'Delete project'}
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

  _renderCard(p) {
    return html`
      <div class="project-card" @click=${() => this._navigateProject(p.id)}>
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
      </div>
    `;
  }

  _renderGrid(filtered) {
    return html`
      <div class="project-grid">
        <div class="new-card" @click=${this._navigateNew}>
          <div class="new-card-icon">${iconPlus}</div>
          <span>New project</span>
        </div>
        ${filtered.map(p => this._renderCard(p))}
      </div>
    `;
  }

  _renderList(filtered) {
    return html`
      <table class="project-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Branch</th>
            <th>Status</th>
            <th>Changes</th>
            <th>Last activity</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(p => html`
            <tr @click=${() => this._navigateProject(p.id)}>
              <td>
                <div class="table-name">
                  <div class="table-glyph">${this._glyph(p.name)}</div>
                  ${p.name}
                </div>
              </td>
              <td>
                <span class="branch-chip">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/>
                    <path d="M6 7v10"/><path d="M18 11c0 3.5-3 5-6 5"/>
                  </svg>
                  ${p.branch}
                </span>
              </td>
              <td>${this._renderStatusPill(p.status)}</td>
              <td>${p.changes > 0 ? html`<span class="changes-badge">${p.changes} changes</span>` : html`<span style="color:var(--fg-3)">—</span>`}</td>
              <td style="color:var(--fg-3)">${this._relativeTime(p.lastActivity)}</td>
              <td class="table-menu-cell">${this._renderMenu(p)}</td>
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }

  render() {
    const filtered = this._filtered();
    const running = this.projects.filter(p => p.status === 'running').length;
    const changed = this.projects.filter(p => p.changes > 0).length;

    return html`
      <loop-top-bar></loop-top-bar>
      <div class="content">
        <div class="page-header">
          <div class="page-title-group">
            <div class="page-title">Projects</div>
            <div class="page-subtitle">
              <span>${this.projects.length}</span> total ·
              <span>${running}</span> running ·
              <span>${changed}</span> with changes
            </div>
          </div>
          <button class="btn-primary" @click=${this._navigateNew}>
            ${iconPlus}
            New project
          </button>
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
        ${filtered.length === 0 && this._search
          ? html`<div class="empty-state">No projects match "${this._search}"</div>`
          : this._viewMode === 'grid' ? this._renderGrid(filtered) : this._renderList(filtered)
        }
      </div>
      ${this._renderDeleteDialog()}
    `;
  }
}

customElements.define('loop-home-screen', LoopHomeScreen);
