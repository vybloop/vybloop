import { LitElement, html, css } from 'lit';
import { iconSettings } from './icons.js';

class LoopTopBar extends LitElement {
  static properties = {
    _configOpen: { state: true },
    _config: { state: true },
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
  `;

  constructor() {
    super();
    this._configOpen = false;
    this._config = { terminalMode: 'direct', gitName: '', gitEmail: '' };
    this._loadConfig();
  }

  connectedCallback() {
    super.connectedCallback();
    this._outsideClick = (e) => {
      if (this._configOpen && !e.composedPath().includes(this)) {
        this._configOpen = false;
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
      const res = await fetch('/api/config');
      if (res.ok) this._config = await res.json();
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

  _togglePopup(e) {
    e.stopPropagation();
    this._configOpen = !this._configOpen;
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
          <button class="icon-btn" title="Settings">${iconSettings}</button>
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
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('loop-top-bar', LoopTopBar);
