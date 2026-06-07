import { LitElement, html, css } from 'lit';
import './loop-top-bar.js';
import { iconArrowLeft, iconChevronDown, iconCheck } from './icons.js';

class LoopNewProjectScreen extends LitElement {
  static properties = {
    _name: { state: true },
    _repo: { state: true },
    _template: { state: true },
    _templates: { state: true },
    _branch: { state: true },
    _setupCmd: { state: true },
    _showAdvanced: { state: true },
    _templateOpen: { state: true },
    _submitting: { state: true },
    _error: { state: true },
    _step: { state: true },
    _githubInfo: { state: true },
    _githubRepoName: { state: true },
    _githubPrivate: { state: true },
    _githubCreating: { state: true },
    _githubError: { state: true },
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
      display: flex;
      justify-content: center;
      padding: 48px 20px;
    }
    .form-card {
      width: 100%;
      max-width: 520px;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--fg-2);
      background: none;
      border: none;
      cursor: pointer;
      font-family: var(--font-sans);
      padding: 0;
      margin-bottom: 24px;
      transition: color 0.12s;
    }
    .back-link:hover { color: var(--fg-0); }
    .form-title {
      font-size: 20px;
      font-weight: 600;
      color: var(--fg-0);
      margin-bottom: 6px;
    }
    .form-subtitle {
      font-size: 13px;
      color: var(--fg-2);
      margin-bottom: 28px;
    }
    .field {
      margin-bottom: 18px;
    }
    label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: var(--fg-2);
      margin-bottom: 6px;
      letter-spacing: 0.02em;
    }
    .label-hint {
      color: var(--fg-3);
      font-weight: 400;
      margin-left: 4px;
    }
    input[type="text"], input[type="url"], textarea {
      width: 100%;
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      color: var(--fg-0);
      font-family: var(--font-sans);
      font-size: 13px;
      padding: 8px 12px;
      outline: none;
      transition: border-color 0.12s;
    }
    input[type="text"]:focus, input[type="url"]:focus, textarea:focus {
      border-color: var(--accent);
    }
    input::placeholder { color: var(--fg-3); }
    textarea { min-height: 60px; resize: vertical; }

    /* Custom dropdown */
    .dropdown-wrap {
      position: relative;
    }
    .dropdown-trigger {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      color: var(--fg-0);
      font-family: var(--font-sans);
      font-size: 13px;
      padding: 8px 12px;
      cursor: pointer;
      transition: border-color 0.12s;
      text-align: left;
    }
    .dropdown-trigger:focus, .dropdown-trigger.open {
      border-color: var(--accent);
      outline: none;
    }
    .dropdown-trigger:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .dropdown-chevron {
      color: var(--fg-3);
      flex-shrink: 0;
      transition: transform 0.15s;
    }
    .dropdown-chevron.open {
      transform: rotate(180deg);
    }
    .dropdown-menu {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: var(--bg-2);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      z-index: 100;
      overflow: hidden;
      max-height: 280px;
      overflow-y: auto;
    }
    .dropdown-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      font-size: 13px;
      color: var(--fg-1);
      cursor: pointer;
      transition: background 0.1s;
      gap: 8px;
    }
    .dropdown-item:hover {
      background: var(--bg-3);
      color: var(--fg-0);
    }
    .dropdown-item.selected {
      color: var(--accent);
    }
    .dropdown-check {
      color: var(--accent);
      flex-shrink: 0;
    }

    .advanced-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--fg-3);
      background: none;
      border: none;
      cursor: pointer;
      font-family: var(--font-sans);
      padding: 0;
      margin-bottom: 16px;
      transition: color 0.12s;
    }
    .advanced-toggle:hover { color: var(--fg-1); }
    .advanced-toggle svg {
      transition: transform 0.15s;
    }
    .advanced-toggle.open svg {
      transform: rotate(90deg);
    }
    .advanced-fields {
      background: var(--bg-1);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .advanced-fields .field {
      margin-bottom: 0;
    }

    .form-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 24px;
    }
    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 20px;
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: opacity 0.12s;
    }
    .btn-primary:hover:not(:disabled) { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-ghost {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 16px;
      background: transparent;
      color: var(--fg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      font-size: 13px;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: border-color 0.12s, color 0.12s;
    }
    .btn-ghost:hover { border-color: var(--line); color: var(--fg-0); }
    .error-msg {
      font-size: 12px;
      color: var(--del);
      margin-top: 4px;
    }
    .divider {
      height: 1px;
      background: var(--line-soft);
      margin: 20px 0;
    }
    .github-prompt {
      background: var(--bg-1);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 18px;
    }
    .github-prompt-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--fg-0);
      margin-bottom: 6px;
    }
    .github-prompt-sub {
      font-size: 13px;
      color: var(--fg-2);
      margin-bottom: 18px;
    }
    .github-username {
      color: var(--accent);
    }
    .radio-group {
      display: flex;
      gap: 10px;
      margin-top: 4px;
    }
    .radio-option {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--fg-1);
      cursor: pointer;
    }
    .radio-option input { cursor: pointer; accent-color: var(--accent); }
  `;

  constructor() {
    super();
    this._name = '';
    this._repo = '';
    this._template = 'blank';
    this._templates = [{ id: 'blank', name: 'Blank workspace' }];
    this._branch = '';
    this._setupCmd = '';
    this._showAdvanced = false;
    this._templateOpen = false;
    this._submitting = false;
    this._error = '';
    this._step = 'form';
    this._githubInfo = null;
    this._githubRepoName = '';
    this._githubPrivate = false;
    this._githubCreating = false;
    this._githubError = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadTemplates();
  }

  async _loadTemplates() {
    try {
      const res = await fetch('/api/templates');
      if (!res.ok) return;
      const templates = await res.json();
      if (Array.isArray(templates) && templates.length) {
        this._templates = templates;
      }
    } catch {
      // Keep the default blank template if the request fails.
    }
  }

  _deriveNameFromRepo(url) {
    if (!url) return '';
    // Strip trailing .git, extract last path segment
    const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');
    const parts = cleaned.split(/[\/:]/).filter(Boolean);
    return parts[parts.length - 1] || '';
  }

  _onRepoInput(e) {
    this._repo = e.target.value;
    if (!this._name || this._name === this._deriveNameFromRepo(this._prevRepo)) {
      this._name = this._deriveNameFromRepo(this._repo);
    }
    this._prevRepo = this._repo;
  }

  _selectTemplate(id) {
    this._template = id;
    this._templateOpen = false;
  }

  _templateLabel() {
    return this._templates.find(t => t.id === this._template)?.name || 'Blank workspace';
  }

  async _submit() {
    if (!this._name.trim()) {
      this._error = 'Project name is required.';
      return;
    }
    this._error = '';

    if (!this._repo.trim()) {
      this._submitting = true;
      try {
        const res = await fetch('/api/github/status');
        const info = await res.json();
        this._githubInfo = info;
        if (info.available) {
          this._githubRepoName = this._name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
          this._step = 'github-prompt';
          return;
        }
      } catch {
        // If check fails, proceed without GitHub prompt
      } finally {
        this._submitting = false;
      }
    }

    await this._createProject(this._repo.trim());
  }

  async _createGithubRepo() {
    this._githubCreating = true;
    this._githubError = '';
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this._githubRepoName.trim(),
          private: this._githubPrivate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create repository');
      await this._createProject(data.url);
    } catch (err) {
      this._githubError = err.message;
      this._githubCreating = false;
    }
  }

  async _createProject(repoUrl) {
    this._submitting = true;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this._name.trim(),
          repo: repoUrl,
          branch: this._branch.trim() || 'main',
          template: this._template,
          setupCmd: this._setupCmd.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create project');
      }
      const project = await res.json();
      this.dispatchEvent(new CustomEvent('project-created', {
        detail: { project },
        bubbles: true,
        composed: true,
      }));
    } catch (err) {
      this._error = err.message;
      this._step = 'form';
    } finally {
      this._submitting = false;
    }
  }

  _cancel() {
    this.dispatchEvent(new CustomEvent('navigate-home', { bubbles: true, composed: true }));
  }

  _renderForm() {
    return html`
      <button class="back-link" @click=${this._cancel}>
        ${iconArrowLeft}
        Back to projects
      </button>
      <div class="form-title">New project</div>
      <div class="form-subtitle">Set up a new project to start vibe-coding with Claude.</div>

      <div class="field">
        <label>Project name <span class="label-hint">(required)</span></label>
        <input
          type="text"
          placeholder="my-project"
          .value=${this._name}
          @input=${e => this._name = e.target.value}
        />
      </div>

      <div class="field">
        <label>Git repository URL <span class="label-hint">(optional)</span></label>
        <input
          type="url"
          placeholder="https://github.com/user/my-project.git"
          .value=${this._repo}
          @input=${this._onRepoInput}
        />
      </div>

      ${(() => {
        const hasRepo = !!this._repo.trim();
        return html`
      <div class="field">
        <label>
          Template
          ${hasRepo ? html`<span class="label-hint">(using cloned repository)</span>` : ''}
        </label>
        <div class="dropdown-wrap">
          <button
            class="dropdown-trigger ${this._templateOpen ? 'open' : ''}"
            ?disabled=${hasRepo}
            @click=${() => { if (!hasRepo) this._templateOpen = !this._templateOpen; }}
          >
            <span>${hasRepo ? 'Blank workspace' : this._templateLabel()}</span>
            <span class="dropdown-chevron ${this._templateOpen ? 'open' : ''}">${iconChevronDown}</span>
          </button>
          ${this._templateOpen && !hasRepo ? html`
            <div class="dropdown-menu">
              ${this._templates.map(t => html`
                <div
                  class="dropdown-item ${this._template === t.id ? 'selected' : ''}"
                  @click=${() => this._selectTemplate(t.id)}
                >
                  <span>${t.name}</span>
                  ${this._template === t.id ? html`<span class="dropdown-check">${iconCheck}</span>` : ''}
                </div>
              `)}
            </div>
          ` : ''}
        </div>
      </div>
        `;
      })()}

      <button
        class="advanced-toggle ${this._showAdvanced ? 'open' : ''}"
        @click=${() => this._showAdvanced = !this._showAdvanced}
      >
        ${iconChevronDown}
        Advanced options
      </button>

      ${this._showAdvanced ? html`
        <div class="advanced-fields">
          <div class="field">
            <label>Branch</label>
            <input
              type="text"
              placeholder="main"
              .value=${this._branch}
              @input=${e => this._branch = e.target.value}
            />
          </div>
          <div class="field">
            <label>Setup command <span class="label-hint">(run after clone)</span></label>
            <input
              type="text"
              placeholder="npm install"
              .value=${this._setupCmd}
              @input=${e => this._setupCmd = e.target.value}
            />
          </div>
        </div>
      ` : ''}

      ${this._error ? html`<div class="error-msg">${this._error}</div>` : ''}

      <div class="form-actions">
        <button
          class="btn-primary"
          ?disabled=${this._submitting || !this._name.trim()}
          @click=${this._submit}
        >
          ${this._submitting ? 'Checking…' : 'Create project'}
        </button>
        <button class="btn-ghost" @click=${this._cancel}>Cancel</button>
      </div>
    `;
  }

  _renderGithubPrompt() {
    const busy = this._githubCreating || this._submitting;
    return html`
      <button class="back-link" @click=${() => { this._step = 'form'; this._githubError = ''; }}>
        ${iconArrowLeft}
        Back
      </button>
      <div class="form-title">Create GitHub repository?</div>
      <div class="form-subtitle">
        A GitHub token was found for
        <span class="github-username">@${this._githubInfo?.username}</span>.
        Would you like to create a new repository for this project?
      </div>

      <div class="github-prompt">
        <div class="field">
          <label>Repository name</label>
          <input
            type="text"
            .value=${this._githubRepoName}
            @input=${e => this._githubRepoName = e.target.value}
            ?disabled=${busy}
          />
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Visibility</label>
          <div class="radio-group">
            <label class="radio-option">
              <input
                type="radio"
                name="visibility"
                .checked=${!this._githubPrivate}
                @change=${() => this._githubPrivate = false}
                ?disabled=${busy}
              />
              Public
            </label>
            <label class="radio-option">
              <input
                type="radio"
                name="visibility"
                .checked=${this._githubPrivate}
                @change=${() => this._githubPrivate = true}
                ?disabled=${busy}
              />
              Private
            </label>
          </div>
        </div>
      </div>

      ${this._githubError ? html`<div class="error-msg">${this._githubError}</div>` : ''}

      <div class="form-actions">
        <button
          class="btn-primary"
          ?disabled=${busy || !this._githubRepoName.trim()}
          @click=${this._createGithubRepo}
        >
          ${this._githubCreating ? 'Creating repo…' : this._submitting ? 'Creating project…' : 'Create repository'}
        </button>
        <button
          class="btn-ghost"
          ?disabled=${busy}
          @click=${() => this._createProject('')}
        >
          Skip
        </button>
      </div>
    `;
  }

  render() {
    return html`
      <loop-top-bar></loop-top-bar>
      <div class="content">
        <div class="form-card">
          ${this._step === 'github-prompt' ? this._renderGithubPrompt() : this._renderForm()}
        </div>
      </div>
    `;
  }
}

customElements.define('loop-new-project-screen', LoopNewProjectScreen);
