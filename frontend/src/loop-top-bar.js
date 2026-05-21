import { LitElement, html, css } from 'lit';
import { iconSettings } from './icons.js';

class LoopTopBar extends LitElement {
  static styles = css`
    :host {
      display: block;
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
    .self-hosted-tag {
      font-size: 10px;
      font-weight: 500;
      color: var(--fg-3);
      background: var(--bg-3);
      border: 1px solid var(--line-soft);
      border-radius: 4px;
      padding: 1px 6px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
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
    }
  `;

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
            <span class="self-hosted-tag">self-hosted</span>
          </div>
          <div class="breadcrumb">
            <slot name="breadcrumb"></slot>
          </div>
        </div>
        <div class="right">
          <button class="icon-btn" title="Settings">${iconSettings}</button>
          <div class="avatar">R</div>
        </div>
      </div>
    `;
  }
}

customElements.define('loop-top-bar', LoopTopBar);
