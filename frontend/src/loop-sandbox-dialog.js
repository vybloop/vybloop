import { LitElement, html, css } from 'lit';
import { iconClose, iconRefresh, iconTrash, iconPencil, iconPlus } from './icons.js';

// "Sandbox tools" dialog, opened from the top-bar menu. Two parts:
//  - This project (when one is in view): which library layers it uses (written
//    to .loop/sandbox.json in its repo), its own .loop/sandbox.Dockerfile with a
//    "promote to library" form, and a restart prompt when the running sandbox
//    is on an older image than the setup now resolves to.
//  - Library: the shared layers — view, edit, create, delete (or revert a
//    modified built-in).
// Backed by backend/src/sandbox-layers.js and sandbox-image.js.
class LoopSandboxDialog extends LitElement {
  static properties = {
    projectId: { attribute: false },
    _layers: { state: true },
    _project: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _busy: { state: true },
    // Layer id being edited, '' for a new layer, null for none.
    _editing: { state: true },
    _draft: { state: true },
    _editError: { state: true },
    _promote: { state: true },
    _promoteError: { state: true },
    _confirm: { state: true },
    _expanded: { state: true },
    _notice: { state: true },
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
      width: 640px;
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
    code {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-1);
    }
    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
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
    .section + .section { margin-top: 14px; }
    .section-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 8px 4px;
    }
    .section-name {
      flex: 1;
      min-width: 0;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--fg-2);
    }
    .banner {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 4px 8px 8px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      line-height: 1.45;
      color: var(--fg-1);
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
    }
    .banner > span { flex: 1; min-width: 0; word-break: break-word; }
    .banner.warn { border-color: oklch(0.78 0.16 65 / 0.4); color: var(--warn); }
    .banner.bad { border-color: oklch(0.72 0.18 25 / 0.4); color: var(--del); }
    .row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
    }
    .row:hover { background: var(--bg-2); }
    label.row { cursor: pointer; }
    .row input[type=checkbox] { margin: 3px 0 0; accent-color: var(--accent); }
    .info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .name {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      font-size: 13px;
      color: var(--fg-0);
    }
    .id {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-3);
    }
    .desc, .meta {
      font-size: 12px;
      color: var(--fg-2);
      line-height: 1.4;
    }
    .meta { color: var(--fg-3); font-size: 11px; }
    .chip {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--accent-soft);
      color: var(--accent);
    }
    .chip.muted { background: var(--bg-3); color: var(--fg-2); }
    pre {
      margin: 4px 0 0;
      padding: 8px 10px;
      max-height: 220px;
      overflow: auto;
      background: var(--bg-0);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: 11px;
      line-height: 1.5;
      color: var(--fg-1);
      white-space: pre;
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
    .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
    .btn.primary:hover:not(:disabled) { background: var(--accent); color: var(--accent-fg); filter: brightness(1.08); }
    .btn.danger, .btn.confirm { color: var(--del); border-color: oklch(0.72 0.18 25 / 0.3); }
    .btn.confirm { background: oklch(0.72 0.18 25 / 0.15); }
    .btn.small { padding: 2px 8px; font-size: 11px; }
    .linkish {
      border: none;
      background: none;
      padding: 0;
      font: inherit;
      font-size: 11px;
      color: var(--fg-3);
      cursor: pointer;
      text-decoration: underline;
      align-self: flex-start;
    }
    .linkish:hover { color: var(--fg-1); }
    .form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 4px 8px 8px;
      padding: 10px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-sm);
      background: var(--bg-2);
    }
    .form input[type=text], .form textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--line);
      background: var(--bg-0);
      color: var(--fg-0);
      font-family: var(--font-sans);
      font-size: 13px;
    }
    .form textarea {
      font-family: var(--font-mono);
      font-size: 12px;
      min-height: 140px;
      resize: vertical;
    }
    .form .field-label { font-size: 11px; color: var(--fg-3); }
    .form .check { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--fg-1); cursor: pointer; }
    .form .actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
    .form .form-error { font-size: 12px; color: var(--del); word-break: break-word; }
  `;

  constructor() {
    super();
    this.projectId = null;
    this._layers = [];
    this._project = null;
    this._loading = false;
    this._error = '';
    this._busy = '';
    this._editing = null;
    this._draft = null;
    this._editError = '';
    this._promote = null;
    this._promoteError = '';
    this._confirm = null;
    this._expanded = new Set();
    this._notice = '';
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

  async _fetchJson(url, options) {
    const res = await fetch(url, options && {
      ...options,
      headers: { 'Content-Type': 'application/json' },
      body: options.body && JSON.stringify(options.body),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  }

  async _load() {
    this._loading = true;
    this._error = '';
    try {
      const [layers, project] = await Promise.all([
        this._fetchJson('/api/sandbox-layers'),
        this.projectId ? this._fetchJson(`/api/projects/${this.projectId}/sandbox`) : null,
      ]);
      this._layers = layers;
      this._project = project;
    } catch (err) {
      this._error = `Could not load sandbox tools: ${err.message}`;
    } finally {
      this._loading = false;
    }
  }

  _close() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  _armOrRun(key, run) {
    if (this._confirm !== key) {
      this._confirm = key;
      return;
    }
    this._confirm = null;
    run();
  }

  _toggleExpanded(id) {
    const next = new Set(this._expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    this._expanded = next;
  }

  // ── This project ──────────────────────────────────────────────────────────

  async _toggleLayer(id, on) {
    const use = new Set(this._project.use);
    if (on) use.add(id); else use.delete(id);
    this._busy = `use:${id}`;
    try {
      this._project = await this._fetchJson(`/api/projects/${this.projectId}/sandbox`, { method: 'PUT', body: { use: [...use] } });
      this._notice = 'Saved to .loop/sandbox.json — commit it to keep the change.';
      this._refreshLayers();
    } catch (err) {
      this._notice = '';
      alert(`Could not update the project's layers: ${err.message}`);
    } finally {
      this._busy = '';
    }
  }

  async _refreshLayers() {
    try { this._layers = await this._fetchJson('/api/sandbox-layers'); } catch {}
  }

  async _restart() {
    this._busy = 'restart';
    try {
      await this._fetchJson(`/api/projects/${this.projectId}/sandbox/restart`, { method: 'POST' });
      // The sessions respawn when the terminals reconnect; give them a moment
      // before asking what they are running on.
      await new Promise(r => setTimeout(r, 1500));
      this._project = await this._fetchJson(`/api/projects/${this.projectId}/sandbox`);
    } catch (err) {
      alert(`Sandbox restart failed: ${err.message}`);
    } finally {
      this._busy = '';
    }
  }

  async _submitPromote(e) {
    e.preventDefault();
    this._busy = 'promote';
    this._promoteError = '';
    try {
      const { layer, sandbox } = await this._fetchJson(`/api/projects/${this.projectId}/sandbox/promote`, {
        method: 'POST',
        body: this._promote,
      });
      this._project = sandbox;
      this._notice = this._promote.replace
        ? `Promoted to "${layer.id}". The project now uses it from .loop/sandbox.json and its .loop/sandbox.Dockerfile was removed — commit both changes.`
        : `Promoted to "${layer.id}". Other projects can enable it now.`;
      this._promote = null;
      await this._refreshLayers();
    } catch (err) {
      this._promoteError = err.message;
    } finally {
      this._busy = '';
    }
  }

  _renderStatus(p) {
    const banners = [];
    if (p.configError) banners.push(html`<div class="banner bad"><span>.loop/sandbox.json is not valid JSON: ${p.configError}</span></div>`);
    if (p.error) banners.push(html`<div class="banner bad"><span>${p.error} The sandbox starts on the base image.</span></div>`);
    for (const w of p.warnings || []) banners.push(html`<div class="banner warn"><span>${w}</span></div>`);
    if (p.stale) {
      banners.push(html`
        <div class="banner warn">
          <span>This sandbox is running an older image than its current setup${p.built ? '' : ' (the new image will be built on restart)'}.</span>
          <button class="btn small" ?disabled=${!!this._busy} @click=${this._restart}>
            ${this._busy === 'restart' ? 'Restarting…' : 'Restart this sandbox'}
          </button>
        </div>
      `);
    }
    return banners;
  }

  _renderPromoteForm() {
    const d = this._promote;
    return html`
      <form class="form" @submit=${this._submitPromote}>
        <span class="field-label">Layer name</span>
        <input type="text" required .value=${d.name}
          @input=${(e) => { this._promote = { ...d, name: e.target.value }; }} placeholder="e.g. Godot" />
        <span class="field-label">Description</span>
        <input type="text" .value=${d.description}
          @input=${(e) => { this._promote = { ...d, description: e.target.value }; }} placeholder="What it installs and what it's for" />
        <label class="check">
          <input type="checkbox" .checked=${d.replace}
            @change=${(e) => { this._promote = { ...d, replace: e.target.checked }; }} />
          Use the library layer in this project instead of its own file
        </label>
        ${this._promoteError ? html`<div class="form-error">${this._promoteError}</div>` : ''}
        <div class="actions">
          <button type="button" class="btn" @click=${() => { this._promote = null; this._promoteError = ''; }}>Cancel</button>
          <button type="submit" class="btn primary" ?disabled=${this._busy === 'promote' || !d.name.trim()}>
            ${this._busy === 'promote' ? 'Promoting…' : 'Promote to library'}
          </button>
        </div>
      </form>
    `;
  }

  _renderProject() {
    const p = this._project;
    if (!p) return '';
    const use = new Set(p.use);
    // Listed layers that aren't in the library any more still need an off switch.
    const missing = p.use.filter(id => !this._layers.some(l => l.id === id));
    return html`
      <div class="section">
        <div class="section-head">
          <span class="section-name">This project</span>
          <span class="id" title="Image a sandbox starting now runs on">${p.image}</span>
        </div>
        ${this._renderStatus(p)}
        ${this._notice ? html`<div class="banner"><span>${this._notice}</span></div>` : ''}
        ${this._layers.map(l => html`
          <label class="row">
            <input type="checkbox" .checked=${use.has(l.id)} ?disabled=${!!this._busy}
              @change=${(e) => this._toggleLayer(l.id, e.target.checked)} />
            <span class="info">
              <span class="name">${l.name} <span class="id">${l.id}</span></span>
              ${l.description ? html`<span class="desc">${l.description}</span>` : ''}
            </span>
          </label>
        `)}
        ${missing.map(id => html`
          <label class="row">
            <input type="checkbox" checked ?disabled=${!!this._busy} @change=${() => this._toggleLayer(id, false)} />
            <span class="info">
              <span class="name"><span class="id">${id}</span> <span class="chip muted">Not in library</span></span>
              <span class="desc">Skipped when the sandbox builds.</span>
            </span>
          </label>
        `)}
        ${p.fragment !== null ? html`
          <div class="row">
            <span class="info">
              <span class="name"><code>.loop/sandbox.Dockerfile</code> <span class="chip muted">This repo</span></span>
              <span class="desc">Built after the library layers above.</span>
              <button class="linkish" @click=${() => this._toggleExpanded('__fragment')}>
                ${this._expanded.has('__fragment') ? 'Hide' : 'Show'} contents
              </button>
              ${this._expanded.has('__fragment') ? html`<pre>${p.fragment}</pre>` : ''}
            </span>
            ${this._promote ? '' : html`
              <button class="btn small" ?disabled=${!!this._busy}
                @click=${() => { this._promote = { name: '', description: '', replace: true }; this._promoteError = ''; }}
              >Promote…</button>
            `}
          </div>
          ${this._promote ? this._renderPromoteForm() : ''}
        ` : html`
          <div class="meta" style="padding: 4px 8px">
            Project-specific tools go in <code>.loop/sandbox.Dockerfile</code> (the agent knows how to write it).
            Promote it here to reuse it in other projects.
          </div>
        `}
      </div>
    `;
  }

  // ── Library ───────────────────────────────────────────────────────────────

  _startEdit(layer) {
    this._editing = layer ? layer.id : '';
    this._draft = layer
      ? { name: layer.name, description: layer.description, fragment: layer.fragment }
      : { name: '', description: '', fragment: 'RUN apt-get update && \\\n    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends <packages> && \\\n    rm -rf /var/lib/apt/lists/*\n' };
    this._editError = '';
  }

  async _saveEdit(e) {
    e.preventDefault();
    const isNew = this._editing === '';
    this._busy = 'edit';
    this._editError = '';
    try {
      await this._fetchJson(
        isNew ? '/api/sandbox-layers' : `/api/sandbox-layers/${this._editing}`,
        { method: isNew ? 'POST' : 'PUT', body: this._draft },
      );
      this._editing = null;
      await this._load();
    } catch (err) {
      this._editError = err.message;
    } finally {
      this._busy = '';
    }
  }

  async _deleteLayer(layer) {
    this._busy = `delete:${layer.id}`;
    try {
      await this._fetchJson(`/api/sandbox-layers/${layer.id}`, { method: 'DELETE' });
      await this._load();
    } catch (err) {
      alert(`Could not delete "${layer.id}": ${err.message}`);
    } finally {
      this._busy = '';
    }
  }

  _renderEditForm() {
    const d = this._draft;
    const isNew = this._editing === '';
    return html`
      <form class="form" @submit=${this._saveEdit}>
        <span class="field-label">Name${isNew ? ' (its id is derived from this)' : ''}</span>
        <input type="text" required .value=${d.name} @input=${(e) => { this._draft = { ...d, name: e.target.value }; }} />
        <span class="field-label">Description</span>
        <input type="text" .value=${d.description} @input=${(e) => { this._draft = { ...d, description: e.target.value }; }} />
        <span class="field-label">Dockerfile fragment — RUN/ENV lines, no FROM, no local COPY/ADD</span>
        <textarea spellcheck="false" .value=${d.fragment} @input=${(e) => { this._draft = { ...d, fragment: e.target.value }; }}></textarea>
        ${!isNew ? html`<span class="meta">Projects using this layer rebuild their sandbox image the next time it starts.</span>` : ''}
        ${this._editError ? html`<div class="form-error">${this._editError}</div>` : ''}
        <div class="actions">
          <button type="button" class="btn" @click=${() => { this._editing = null; }}>Cancel</button>
          <button type="submit" class="btn primary" ?disabled=${this._busy === 'edit' || !d.name.trim() || !d.fragment.trim()}>
            ${this._busy === 'edit' ? 'Saving…' : isNew ? 'Create layer' : 'Save'}
          </button>
        </div>
      </form>
    `;
  }

  _renderLayer(l) {
    if (this._editing === l.id) return this._renderEditForm();
    const key = `delete:${l.id}`;
    const deletable = !l.builtin || l.modified;
    const used = l.usedBy.length;
    return html`
      <div class="row">
        <span class="info">
          <span class="name">
            ${l.name} <span class="id">${l.id}</span>
            ${l.builtin ? html`<span class="chip ${l.modified ? '' : 'muted'}">${l.modified ? 'Modified' : 'Built-in'}</span>` : ''}
          </span>
          ${l.description ? html`<span class="desc">${l.description}</span>` : ''}
          <span class="meta" title=${l.usedBy.map(u => u.label).join('\n')}>
            ${used ? `Used by ${used} project${used > 1 ? 's' : ''}: ${l.usedBy.map(u => u.label).join(', ')}` : 'Not used by any project'}
          </span>
          <button class="linkish" @click=${() => this._toggleExpanded(l.id)}>
            ${this._expanded.has(l.id) ? 'Hide' : 'Show'} Dockerfile
          </button>
          ${this._expanded.has(l.id) ? html`<pre>${l.fragment}</pre>` : ''}
        </span>
        <button class="icon-btn" title="Edit" ?disabled=${!!this._busy || this._editing !== null} @click=${() => this._startEdit(l)}>${iconPencil}</button>
        ${deletable ? html`
          <button
            class="btn small ${this._confirm === key ? 'confirm' : 'danger'}"
            ?disabled=${!!this._busy}
            title=${l.modified ? 'Discard your changes and restore the built-in version' : 'Delete this layer'}
            @click=${() => this._armOrRun(key, () => this._deleteLayer(l))}
          >${this._busy === key ? '…' : this._confirm === key ? (l.modified ? 'Confirm revert' : 'Confirm delete') : l.modified ? 'Revert' : iconTrash}</button>
        ` : ''}
      </div>
    `;
  }

  _renderLibrary() {
    return html`
      <div class="section">
        <div class="section-head">
          <span class="section-name">Library</span>
          <button class="btn small" ?disabled=${this._editing !== null} @click=${() => this._startEdit(null)}>${iconPlus} New layer</button>
        </div>
        ${this._editing === '' ? this._renderEditForm() : ''}
        ${this._layers.map(l => this._renderLayer(l))}
      </div>
    `;
  }

  render() {
    return html`
      <div class="overlay" @click=${(e) => e.target === e.currentTarget && this._close()}>
        <div class="box" role="dialog" aria-label="Sandbox tools">
          <div class="head">
            <span class="title">Sandbox tools</span>
            <button class="icon-btn" title="Refresh" ?disabled=${this._loading} @click=${this._load}>${iconRefresh}</button>
            <button class="icon-btn" title="Close" @click=${this._close}>${iconClose}</button>
          </div>
          <div class="hint">
            Tools installed here are built into a cached sandbox image, so new sessions and workstreams start
            with them ready. Library layers are shared across projects; a project picks them in
            <code>.loop/sandbox.json</code> and can add its own in <code>.loop/sandbox.Dockerfile</code>.
          </div>
          <div class="body">
            ${this._error ? html`<div class="error">${this._error}</div>`
              : this._loading && this._layers.length === 0 ? html`<div class="empty">Loading…</div>`
              : html`${this._renderProject()}${this._renderLibrary()}`}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('loop-sandbox-dialog', LoopSandboxDialog);
