import { LitElement, html, css } from 'lit';

// A thin status strip for background activity. Each item is
//   { id, label, detail?, progress?, error?, dismissible? }
// where `progress` is 0..1 for a determinate bar, `null` for an indeterminate
// one, and absent (undefined) for a plain text line with no bar. `error` tints
// the item; `dismissible` adds an × that fires a `dismiss` event with
// `detail: { id }` — the host removes the item. Renders nothing when `items`
// is empty, so the host can always be mounted.
class LoopStatusBar extends LitElement {
  static properties = {
    items: { attribute: false },
  };

  static styles = css`
    :host { display: block; }
    :host([hidden]) { display: none; }
    .bar {
      background: var(--bg-1);
      border-top: 1px solid var(--line-soft);
      padding: 6px 12px 7px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: var(--font-sans);
    }
    .item { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .text {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 11px;
      line-height: 1.3;
      min-width: 0;
    }
    .label { color: var(--fg-1); flex-shrink: 0; }
    .detail {
      color: var(--fg-3);
      font-family: var(--font-mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
      flex: 1;
    }
    .item.error .label { color: var(--del); }
    .item.error .detail {
      color: var(--fg-2);
      white-space: normal;
      word-break: break-word;
    }
    .dismiss {
      flex-shrink: 0;
      margin-left: auto;
      align-self: flex-start;
      background: none;
      border: none;
      padding: 0 2px;
      color: var(--fg-3);
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
    }
    .dismiss:hover { color: var(--fg-1); }
    .pct { color: var(--fg-2); font-family: var(--font-mono); flex-shrink: 0; margin-left: auto; }
    .track {
      height: 3px;
      border-radius: 2px;
      background: var(--bg-3);
      overflow: hidden;
      position: relative;
    }
    .fill {
      height: 100%;
      background: var(--accent);
      border-radius: 2px;
      transition: width 0.15s linear;
    }
    .fill.indeterminate {
      position: absolute;
      width: 30%;
      animation: slide 1.1s ease-in-out infinite;
    }
    @keyframes slide {
      from { left: -30%; }
      to { left: 100%; }
    }
  `;

  constructor() {
    super();
    this.items = [];
  }

  updated() {
    this.hidden = !this.items?.length;
  }

  render() {
    if (!this.items?.length) return '';
    return html`
      <div class="bar" role="status">
        ${this.items.map(item => this._renderItem(item))}
      </div>
    `;
  }

  _renderItem({ id, label, detail, progress, error, dismissible }) {
    const hasBar = progress !== undefined;
    const determinate = typeof progress === 'number';
    const pct = determinate ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : 0;
    return html`
      <div class="item ${error ? 'error' : ''}">
        <div class="text">
          <span class="label">${label}</span>
          ${detail ? html`<span class="detail" title=${detail}>${detail}</span>` : ''}
          ${determinate ? html`<span class="pct">${pct}%</span>` : ''}
          ${dismissible ? html`
            <button class="dismiss" title="Dismiss" aria-label="Dismiss"
              @click=${() => this.dispatchEvent(new CustomEvent('dismiss', { detail: { id } }))}>×</button>
          ` : ''}
        </div>
        ${hasBar ? html`
          <div class="track">
            ${determinate
              ? html`<div class="fill" style="width:${pct}%"></div>`
              : html`<div class="fill indeterminate"></div>`}
          </div>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('loop-status-bar', LoopStatusBar);
