import { LitElement, html, css } from 'lit';
import './loop-top-bar.js';
import './loop-home-screen.js';
import './loop-new-project-screen.js';
import './loop-project-screen.js';

class LoopApp extends LitElement {
  static properties = {
    _route: { state: true },
    _projectId: { state: true },
    _projects: { state: true },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: var(--bg-0);
      color: var(--fg-0);
      font-family: var(--font-sans);
    }
    .screen {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }
  `;

  constructor() {
    super();
    this._route = 'home';
    this._projectId = null;
    this._projects = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this._fetchProjects();

    this.addEventListener('navigate-new', () => this._route = 'new');
    this.addEventListener('navigate-home', () => this._route = 'home');
    this.addEventListener('navigate-project', (e) => {
      this._projectId = e.detail.id;
      this._route = 'project';
    });
    this.addEventListener('project-created', (e) => {
      this._projects = [...this._projects, e.detail.project];
      this._projectId = e.detail.project.id;
      this._route = 'project';
    });
  }

  async _fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        this._projects = await res.json();
      }
    } catch (e) {
      console.warn('Could not fetch projects from API, using empty list', e);
    }
  }

  get _currentProject() {
    return this._projects.find(p => p.id === this._projectId) || null;
  }

  render() {
    return html`
      <div class="screen">
        ${this._route === 'home' ? html`
          <loop-home-screen .projects=${this._projects}></loop-home-screen>
        ` : this._route === 'new' ? html`
          <loop-new-project-screen></loop-new-project-screen>
        ` : this._route === 'project' ? html`
          <loop-project-screen .project=${this._currentProject}></loop-project-screen>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('loop-app', LoopApp);
