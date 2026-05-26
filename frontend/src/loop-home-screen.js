import { LitElement, html, css } from 'lit';
import './loop-top-bar.js';
import {
  iconPlus, iconSearch, iconGrid, iconList, iconGit, iconBranch, iconChevron
} from './icons.js';

const _isMac = /Macintosh|MacIntel/.test(navigator.userAgent);
const _isMobile = window.matchMedia('(pointer: coarse)').matches;
const _modKey = _isMac ? '⌘' : 'Ctrl-';

class LoopHomeScreen extends LitElement {
  static properties = {
    projects: { type: Array },
    _search: { state: true },
    _viewMode: { state: true },
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
  `;

  constructor() {
    super();
    this.projects = [];
    this._search = '';
    this._viewMode = 'grid';
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._handleKeydown.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleKeydown.bind(this));
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
          ${this._renderStatusPill(p.status)}
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
    `;
  }
}

customElements.define('loop-home-screen', LoopHomeScreen);
