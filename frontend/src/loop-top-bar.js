import { LitElement, html, css } from 'lit';
import { iconMenu } from './icons.js';

class LoopTopBar extends LitElement {
  static properties = {
    _configOpen: { state: true },
    _config: { state: true },
    _github: { state: true },
    _menuOpen: { state: true },
    _sandboxBusy: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      flex-shrink: 0;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 52px;
      padding: 0 20px;
      background: var(--bg-1);
      border-bottom: 1px solid var(--line-soft);
      flex-shrink: 0;
    }
    .left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-area {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo-svg {
      display: flex;
      align-items: center;
    }
    .logo-text {
      font-size: 17px;
      font-weight: 600;
      color: var(--fg-0);
      letter-spacing: -0.02em;
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--fg-2);
    }
    .right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
      border: none;
      background: transparent;
      color: var(--fg-2);
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
    }
    .icon-btn:hover {
      background: var(--bg-3);
      color: var(--fg-0);
    }
    .avatar-wrap {
      position: relative;
    }
    .menu-wrap {
      position: relative;
    }
    .menu-popup {
      padding: 6px;
      min-width: 180px;
    }
    .menu-item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 8px 10px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--fg-1);
      font-family: var(--font-sans);
      font-size: 13px;
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
    }
    .menu-item:hover:not(:disabled) {
      background: var(--bg-3);
      color: var(--fg-0);
    }
    .menu-item:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1.5px solid var(--accent);
      user-select: none;
    }
    .config-popup {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      background: var(--bg-1);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 14px;
      min-width: 220px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
      z-index: 100;
    }
    .popup-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--fg-3);
      margin-bottom: 12px;
    }
    .config-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .config-row + .config-row {
      margin-top: 12px;
    }
    .config-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--fg-1);
    }
    .config-input {
      width: 100%;
      background: var(--bg-2);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-sm);
      color: var(--fg-0);
      font-family: var(--font-sans);
      font-size: 12px;
      padding: 5px 8px;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.12s;
    }
    .config-input:focus { border-color: var(--accent); }
    .config-input::placeholder { color: var(--fg-3); }
    .config-input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .config-hint {
      font-size: 11px;
      color: var(--fg-3);
      line-height: 1.4;
    }
    .config-divider {
      border: none;
      border-top: 1px solid var(--line-soft);
      margin: 12px 0;
    }
    .segmented {
      display: flex;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .seg-btn {
      flex: 1;
      padding: 5px 10px;
      font-size: 12px;
      font-family: var(--font-sans);
      border: none;
      background: transparent;
      color: var(--fg-2);
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
    }
    .seg-btn + .seg-btn {
      border-left: 1px solid var(--line-soft);
    }
    .seg-btn.active {
      background: var(--accent);
      color: var(--accent-fg);
    }
    .seg-btn:not(.active):hover {
      background: var(--bg-3);
      color: var(--fg-0);
    }
    .gh-account {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: var(--fg-1);
      padding: 4px 0;
    }
    .gh-account + .gh-account { border-top: 1px solid var(--line-soft); }
    .gh-link {
      display: inline-block;
      font-size: 12px;
      color: var(--accent);
      text-decoration: none;
    }
    .gh-link:hover { text-decoration: underline; }
    .gh-link.button {
      margin-top: 4px;
      padding: 5px 10px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-sm);
      color: var(--fg-0);
      text-align: center;
    }
    .gh-link.button:hover { background: var(--bg-3); text-decoration: none; }
  `;

  constructor() {
    super();
    this._configOpen = false;
    this._config = { terminalMode: 'direct', gitName: '', gitEmail: '', portRange: '22000-23000' };
    this._github = { mode: 'none', installations: [], pat: { configured: false, fromEnv: false } };
    this._menuOpen = false;
    this._sandboxBusy = '';
    this._loadConfig();
  }

  connectedCallback() {
    super.connectedCallback();
    this._outsideClick = (e) => {
      if ((this._configOpen || this._menuOpen) && !e.composedPath().includes(this)) {
        this._configOpen = false;
        this._menuOpen = false;
      }
    };
    document.addEventListener('click', this._outsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._outsideClick);
  }

  async _loadConfig() {
    try {
      const [configRes, githubRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/config/github'),
      ]);
      if (configRes.ok) this._config = await configRes.json();
      if (githubRes.ok) this._github = await githubRes.json();
    } catch {}
  }

  async _patchConfig(updates) {
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) this._config = await res.json();
    } catch {}
  }

  async _setTerminalMode(mode) {
    return this._patchConfig({ terminalMode: mode });
  }

  _onNameBlur(e) {
    const val = e.target.value.trim();
    if (val !== this._config.gitName) this._patchConfig({ gitName: val });
  }

  _onEmailBlur(e) {
    const val = e.target.value.trim();
    if (val !== this._config.gitEmail) this._patchConfig({ gitEmail: val });
  }

  _onPortRangeBlur(e) {
    const val = e.target.value.trim();
    if (val !== this._config.portRange) this._patchConfig({ portRange: val });
  }

  async _onPatBlur(e) {
    const val = e.target.value;
    if (!val) return;
    try {
      const res = await fetch('/api/config/github/pat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pat: val }),
      });
      if (res.ok) {
        this._github = await res.json();
        e.target.value = '';
      }
    } catch {}
  }

  _togglePopup(e) {
    e.stopPropagation();
    this._configOpen = !this._configOpen;
  }

  _toggleMenu(e) {
    e.stopPropagation();
    this._menuOpen = !this._menuOpen;
  }

  async _sandboxAction(action) {
    if (this._sandboxBusy) return;
    this._sandboxBusy = action;
    try {
      const res = await fetch(`/api/sandbox/${action}`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      this._menuOpen = false;
    } catch (err) {
      alert(`Sandbox ${action} failed: ${err.message}`);
    } finally {
      this._sandboxBusy = '';
    }
  }

  _renderGithub() {
    const gh = this._github;
    if (gh.mode === 'app') {
      return html`
        <div class="config-row">
          <div class="config-label">GitHub App — ${gh.slug}</div>
          ${gh.error ? html`<div class="config-hint">Could not reach GitHub: ${gh.error}</div>` : ''}
          ${gh.installations?.length ? gh.installations.map(inst => html`
            <div class="gh-account">
              <span>${inst.account}</span>
              <a class="gh-link" href=${inst.manageUrl} target="_blank" rel="noopener">Manage repos</a>
            </div>
          `) : html`<div class="config-hint">Not installed on any account yet.</div>`}
          <a class="gh-link button" href=${gh.installUrl} target="_blank" rel="noopener">
            ${gh.installations?.length ? 'Add / configure repositories' : 'Install on GitHub'}
          </a>
        </div>
      `;
    }
    // PAT / none mode
    const fromEnv = gh.pat?.fromEnv;
    const configured = gh.pat?.configured;
    return html`
      <div class="config-row">
        <div class="config-label">GitHub PAT</div>
        <input
          class="config-input"
          type="password"
          ?disabled=${fromEnv}
          placeholder=${fromEnv ? 'Set via environment variable' : configured ? 'Set — enter new value to replace' : 'ghp_…'}
          @blur=${this._onPatBlur}
          @keydown=${e => e.key === 'Enter' && e.target.blur()}
        />
        ${fromEnv ? html`
          <div class="config-hint">Token is provided by the <code>GITHUB_TOKEN</code> environment variable.</div>
        ` : html`
          <div class="config-hint">Configure a GitHub App (<code>GITHUB_APP_ID</code> + private key) to grant repo access by installing the app instead.</div>
        `}
      </div>
    `;
  }

  render() {
    return html`
      <div class="topbar">
        <div class="left">
          <div class="logo-area">
            <div class="logo-svg">
              <svg width="26" height="20" viewBox="0 0 26 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 10C13 7.5 11 4 7.5 4C4 4 2 6.5 2 9.5C2 13.5 5 16 8 16C11 16 13 13.5 13 10Z" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                <path d="M13 10C13 7.5 15 4 18.5 4C22 4 24 6.5 24 9.5C24 13.5 21 16 18 16C15 16 13 13.5 13 10Z" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
            </div>
            <span class="logo-text">loop</span>
          </div>
          <div class="breadcrumb">
            <slot name="breadcrumb"></slot>
          </div>
        </div>
        <div class="right">
          <div class="menu-wrap">
            <button class="icon-btn" title="Menu" @click=${this._toggleMenu}>${iconMenu}</button>
            ${this._menuOpen ? html`
              <div class="config-popup menu-popup">
                <button
                  class="menu-item"
                  ?disabled=${!!this._sandboxBusy}
                  @click=${() => this._sandboxAction('rebuild')}
                >${this._sandboxBusy === 'rebuild' ? 'Rebuilding sandbox…' : 'Rebuild sandbox'}</button>
                <button
                  class="menu-item"
                  ?disabled=${!!this._sandboxBusy}
                  @click=${() => this._sandboxAction('restart')}
                >${this._sandboxBusy === 'restart' ? 'Restarting sandbox…' : 'Restart sandbox'}</button>
              </div>
            ` : ''}
          </div>
          <div class="avatar-wrap">
            <div class="avatar" @click=${this._togglePopup}>
              ${this._config.gitName ? this._config.gitName.trim()[0].toUpperCase() : '?'}
            </div>
            ${this._configOpen ? html`
              <div class="config-popup">
                <div class="popup-title">Settings</div>
                <div class="config-row">
                  <div class="config-label">Name</div>
                  <input
                    class="config-input"
                    type="text"
                    placeholder="Your name"
                    .value=${this._config.gitName || ''}
                    @blur=${this._onNameBlur}
                    @keydown=${e => e.key === 'Enter' && e.target.blur()}
                  />
                </div>
                <div class="config-row">
                  <div class="config-label">Email</div>
                  <input
                    class="config-input"
                    type="email"
                    placeholder="you@example.com"
                    .value=${this._config.gitEmail || ''}
                    @blur=${this._onEmailBlur}
                    @keydown=${e => e.key === 'Enter' && e.target.blur()}
                  />
                </div>
                <hr class="config-divider" />
                <div class="config-row">
                  <div class="config-label">Terminal mode</div>
                  <div class="segmented">
                    <button
                      class="seg-btn ${this._config.terminalMode === 'tmux' ? 'active' : ''}"
                      @click=${() => this._setTerminalMode('tmux')}
                    >tmux</button>
                    <button
                      class="seg-btn ${this._config.terminalMode === 'direct' ? 'active' : ''}"
                      @click=${() => this._setTerminalMode('direct')}
                    >direct</button>
                  </div>
                </div>
                <hr class="config-divider" />
                <div class="config-row">
                  <div class="config-label">Port range</div>
                  <input
                    class="config-input"
                    type="text"
                    placeholder="22000-23000"
                    .value=${this._config.portRange || ''}
                    @blur=${this._onPortRangeBlur}
                    @keydown=${e => e.key === 'Enter' && e.target.blur()}
                  />
                </div>
                <hr class="config-divider" />
                ${this._renderGithub()}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('loop-top-bar', LoopTopBar);
