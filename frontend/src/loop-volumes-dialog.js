import { LitElement, html, css } from 'lit';
import { iconClose, iconRefresh, iconTrash } from './icons.js';

// "Volumes" dialog, opened from the top-bar menu. Lists the podman volumes
// created by project compose stacks, grouped by project, and deletes them.
// Compose recreates a missing volume empty on the next Run, so deleting is how
// you reset a project's data to a clean slate.
class LoopVolumesDialog extends LitElement {
  static properties = {
    // Id of the project in view, if any — its volumes are listed first.
    projectId: { attribute: false },
    _volumes: { state: true },
    _loading: { state: true },
    _error: { state: true },
    // Key ('vol:<name>' | 'group:<project>') awaiting a second confirming click.
    _confirm: { state: true },
    // Volume names currently being deleted.
    _deleting: { state: true },
  };

  static styles = css`
    .overlay {
      position: fixed;
      inset: 0;
      background: oklch(0 0 0 / 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
    }
    .box {
      background: var(--bg-1);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      width: 560px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 64px);
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 32px oklch(0 0 0 / 0.4);
    }
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px 16px 4px 20px;
    }
    .title {
      flex: 1;
      font-size: 14px;
      font-weight: 600;
      color: var(--fg-0);
    }
    .hint {
      padding: 0 20px 12px;
      font-size: 12px;
      color: var(--fg-3);
      line-height: 1.5;
      border-bottom: 1px solid var(--line-soft);
    }
    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      border: none;
      background: transparent;
      color: var(--fg-2);
      cursor: pointer;
    }
    .icon-btn:hover:not(:disabled) { background: var(--bg-3); color: var(--fg-0); }
    .icon-btn:disabled { opacity: 0.4; cursor: default; }
    .body {
      overflow-y: auto;
      padding: 8px 12px 16px;
    }
    .empty, .error {
      padding: 24px 8px;
      text-align: center;
      font-size: 13px;
      color: var(--fg-3);
    }
    .error { color: var(--del); word-break: break-word; }
    .group + .group { margin-top: 10px; }
    .group-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 8px 4px;
    }
    .group-name {
      flex: 1;
      min-width: 0;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--fg-2);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .group-name .muted {
      text-transform: none;
      letter-spacing: 0;
      font-weight: 400;
      color: var(--fg-3);
    }
    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
    }
    .row:hover { background: var(--bg-2); }
    .vol {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .vol-name {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--fg-0);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .vol-meta {
      font-size: 11px;
      color: var(--fg-3);
    }
    .chip {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--accent-soft);
      color: var(--accent);
    }
    .btn {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      border: 1px solid var(--line-soft);
      background: var(--bg-2);
      color: var(--fg-2);
      transition: background 0.1s, color 0.1s;
    }
    .btn:hover:not(:disabled) { background: var(--bg-3); color: var(--fg-0); }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn.danger,
    .btn.confirm {
      color: var(--del);
      border-color: oklch(0.72 0.18 25 / 0.3);
    }
    .btn.confirm { background: oklch(0.72 0.18 25 / 0.15); }
    .btn.danger:hover:not(:disabled),
    .btn.confirm:hover:not(:disabled) { background: oklch(0.72 0.18 25 / 0.25); color: var(--del); }
    .btn.small { padding: 2px 8px; font-size: 11px; }
    .row-error {
      padding: 0 8px 6px;
      font-size: 11px;
      color: var(--del);
      word-break: break-word;
    }
  `;

  constructor() {
    super();
    this.projectId = null;
    this._volumes = [];
    this._loading = false;
    this._error = '';
    this._confirm = null;
    this._deleting = new Set();
    this._rowErrors = {};
    this._onKeyDown = (e) => { if (e.key === 'Escape') this._close(); };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeyDown);
    this._load();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeyDown);
  }

  async _load() {
    this._loading = true;
    this._error = '';
    try {
      const res = await fetch('/api/volumes');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      if (!Array.isArray(body)) throw new Error('unexpected response from server');
      this._volumes = body;
    } catch (err) {
      this._error = `Could not list volumes: ${err.message}`;
    } finally {
      this._loading = false;
    }
  }

  _close() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  // First click arms the button, second click (on the same key) runs it.
  _armOrRun(key, run) {
    if (this._confirm !== key) {
      this._confirm = key;
      return;
    }
    this._confirm = null;
    run();
  }

  async _delete(names) {
    this._deleting = new Set([...this._deleting, ...names]);
    for (const name of names) delete this._rowErrors[name];
    await Promise.all(names.map(async (name) => {
      try {
        const res = await fetch(`/api/volumes/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        this._volumes = this._volumes.filter(v => v.name !== name);
      } catch (err) {
        this._rowErrors[name] = err.message;
      }
    }));
    this._deleting = new Set([...this._deleting].filter(n => !names.includes(n)));
  }

  // [{ key, label, sublabel, volumes }] — the project in view first, then
  // projects, then volumes whose project no longer exists, then unlabelled ones.
  get _groups() {
    const byProject = new Map();
    for (const v of this._volumes) {
      const key = v.project ?? '';
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key).push(v);
    }
    const rank = (key, vols) =>
      key && key === this.projectId ? 0 : key && vols[0].projectLabel ? 1 : key ? 2 : 3;
    return [...byProject.entries()]
      .map(([key, volumes]) => ({
        key,
        rank: rank(key, volumes),
        label: !key ? 'Other volumes' : volumes[0].projectLabel ?? key,
        sublabel: !key ? '' : !volumes[0].projectLabel ? 'project deleted' : key === this.projectId ? 'this project' : '',
        volumes,
      }))
      .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
  }

  _renderRow(v) {
    const busy = this._deleting.has(v.name);
    const key = `vol:${v.name}`;
    // Compose names volumes "<project>_<name>"; the group header already says the project.
    const short = v.project && v.name.startsWith(`${v.project}_`) ? v.name.slice(v.project.length + 1) : v.name;
    const created = v.createdAt ? new Date(v.createdAt).toLocaleString() : '';
    const error = this._rowErrors[v.name];
    return html`
      <div class="row">
        <div class="vol">
          <span class="vol-name" title=${v.name}>${short}</span>
          <span class="vol-meta">${created ? `Created ${created}` : ''}</span>
        </div>
        ${v.inUse ? html`<span class="chip" title=${v.containers.map(c => `${c.name} (${c.state})`).join('\n')}>In use</span>` : ''}
        <button
          class="btn ${this._confirm === key ? 'confirm' : 'danger'}"
          ?disabled=${busy || v.inUse}
          title=${v.inUse ? 'Stop the project before deleting this volume' : 'Delete this volume'}
          @click=${() => this._armOrRun(key, () => this._delete([v.name]))}
        >${busy ? 'Deleting…' : this._confirm === key ? 'Confirm delete' : iconTrash}</button>
      </div>
      ${error ? html`<div class="row-error">${error}</div>` : ''}
    `;
  }

  _renderGroup(g) {
    const deletable = g.volumes.filter(v => !v.inUse && !this._deleting.has(v.name)).map(v => v.name);
    const key = `group:${g.key}`;
    return html`
      <div class="group">
        <div class="group-head">
          <span class="group-name">${g.label}${g.sublabel ? html` <span class="muted">· ${g.sublabel}</span>` : ''}</span>
          ${g.volumes.length > 1 ? html`
            <button
              class="btn small ${this._confirm === key ? 'confirm' : ''}"
              ?disabled=${deletable.length === 0}
              @click=${() => this._armOrRun(key, () => this._delete(deletable))}
            >${this._confirm === key ? `Delete ${deletable.length}?` : 'Delete all'}</button>
          ` : ''}
        </div>
        ${g.volumes.map(v => this._renderRow(v))}
      </div>
    `;
  }

  render() {
    return html`
      <div class="overlay" @click=${(e) => e.target === e.currentTarget && this._close()}>
        <div class="box" role="dialog" aria-label="Volumes">
          <div class="head">
            <span class="title">Volumes</span>
            <button class="icon-btn" title="Refresh" ?disabled=${this._loading} @click=${this._load}>${iconRefresh}</button>
            <button class="icon-btn" title="Close" @click=${this._close}>${iconClose}</button>
          </div>
          <div class="hint">
            Deleting a volume wipes its data. Compose recreates it empty on the next Run.
            Volumes in use by a running project can't be deleted — stop the project first.
          </div>
          <div class="body">
            ${this._error ? html`<div class="error">${this._error}</div>`
              : this._loading && this._volumes.length === 0 ? html`<div class="empty">Loading…</div>`
              : this._volumes.length === 0 ? html`<div class="empty">No volumes.</div>`
              : this._groups.map(g => this._renderGroup(g))}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('loop-volumes-dialog', LoopVolumesDialog);
