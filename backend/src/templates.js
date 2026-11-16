// Project templates. Each template has an id, a display name, and the contents
// of an initial CLAUDE.md file written into the project when it is created
// without an existing git repository (when a repo URL is given we clone it
// instead and leave its files untouched).

const SHARED_FOOTER = `
## Working in this project

- Keep changes small and focused; explain non-obvious decisions in code comments.
- Match the existing style, naming, and structure of the surrounding code.
- Prefer the project's existing dependencies over adding new ones.

## Running the app in Loop

The user can't reach anything listening inside the agent's sandbox, so a dev
server started there is invisible to them. Loop runs the app with its **Run**
button, which appears once a \`docker-compose.yml\` exists at the repo root and
runs \`compose up --build\`. If this project is served over HTTP (a site, web
app, browser game or web API) and has no compose file yet, add a \`Dockerfile\`
that installs dependencies and builds the app, plus a root \`docker-compose.yml\`
that serves it. Verify by building and starting the app in the sandbox, then
tell the user to press **Run** (or **Restart** after later changes). Things
that aren't served (a browser extension, CLI, library) need no compose file:
build them and hand the result over with Loop's share script.

The host port is assigned by Loop and passed in as the \`HOST_PORT\` environment
variable when the app is started. New compose files should publish through that
variable rather than a fixed host port, e.g.

\`\`\`yaml
services:
  web:
    ports:
      - "\${HOST_PORT}:8080"
\`\`\`

The container-side port (\`8080\` above) is the project's own choice and can be
whatever the app listens on. Only the host side comes from \`HOST_PORT\`. Leave
port mappings in an existing compose file alone unless asked to change them.

A service that needs \`network_mode: host\` has no port mapping, so it must
listen on \`HOST_PORT\` itself instead, e.g. \`environment: [ "PORT=\${HOST_PORT}" ]\`.
Loop detects it by connecting to that port.
`;

export const TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank workspace',
    claudeMd: `# CLAUDE.md

This file gives Claude Code guidance for working in this project.

## Overview

A blank workspace. Describe the project's purpose here as it takes shape so
future sessions have the context they need.
${SHARED_FOOTER}`,
  },
  {
    id: 'web-game',
    name: 'Web game',
    claudeMd: `# CLAUDE.md

This file has a concise description of the project and guidance for working in it. Update this file after every task even if the user doesn't explicitly ask you to, and ensure the document stays up to date.
Remove any instructions from this file that are intended to be followed once after you have followed them (e.g. for initial setup of the project).
 
This repo is mostly empty, and is intended to be a web based game. The first time the user asks you to do any work on this project, you should ask these questions and record the answers here:

- Is the game going to have 2D or 3D graphics?
- Will the game have detailed physics (more complicated than a 2D side scrolling game)?
- Will the game have multiplayer features?
- Will the game have any shared state between players like a high score board?
- If multiplayer: is it competitive (players can affect each other's outcome, and cheating would matter), or cooperative/casual?
- Will the game need to work on mobile browsers?

Based on the answers to these questions, decide on a stack and fill out the section below.

Suggested web stacks and technologies. These are defaults and guidelines, not strict rules: if the game's needs point somewhere else, use your judgment and note the reasoning in the Stack section.
 - Vanilla JS, using Web Components for structure and CSS for styling. Avoid bundlers and frameworks unless it offers a clear advantage.
 - If a physics engine seems necessary, Rapier.js is a good default if it is sufficient for the game's needs.
 - In most cases with any level of graphics, use WebGL for rendering.
 - For multiplayer features, use WebSockets for real-time communication if needed.
 - If a backend is needed, Node.js is usually the best fit, because game logic can be shared between client and server. Prefer plain ES modules ("type": "module") and put code used by both sides in shared/, free of DOM- and Node-specific APIs. The server can serve shared/ statically so the browser imports the same files without a bundler. The \`ws\` package works well for WebSockets. Consider another language when a specific library or performance need clearly calls for it.
 - For multiplayer, pick a model that suits the game. Some typical starting points:
   - Competitive real-time: the server decides outcomes (hits, scores, pickups, win/loss). A good start is clients owning their own movement with the server validating it; full server simulation with client prediction is worth its complexity only when the game needs it.
   - Turn-based: the server validates each move against the shared rules.
   - Co-op/casual or collaborative: clients can own their own entities, with the server relaying state; prediction/reconciliation usually isn't needed.
   - Single-player with leaderboards: gameplay can stay client-side, with the server storing scores and doing basic sanity checks.
   Record the chosen model and why in the Stack section, so later sessions don't "fix" it into a different one.
 - The game should be designed to serve from a single container, so frontend content should be served from the same container as any backend code
 - If no backend is needed, a lightweight nginx container is a simple way to serve the content. If a backend is added later, serve everything from the backend container instead.

## Stack

This application runs in the browser, and should be served from a container. A Dockerfile and docker-compose.yml file should be created in the root of the repository.
Fill in the rest of this section based on the answers in the first section.

- TBD

## File structure

- Dockerfile - configure this to serve the game from a container
- docker-compose.yml - configure this to serve the game from a container. Publish the host port through the \`\${HOST_PORT}\` environment variable (see "Running the app in Loop" below) rather than hard-coding one.
- frontend/ - should contain front end code
- backend/ - should contain backend code, if necessary
- shared/ - code used by both frontend and backend (game rules, simulation, message formats), if there is a backend

${SHARED_FOOTER}`,
  },
  {
    id: 'web-app',
    name: 'Web app',
    claudeMd: `# CLAUDE.md

This file has a concise description of the project and guidance for working in it. Update this file after every task even if the user doesn't explicitly ask you to, and ensure the document stays up to date.
Remove any instructions from this file that are intended to be followed once after you have followed them (e.g. for initial setup of the project).

This repo is mostly empty, and is intended to be a web app. The first time the user asks you to do any work on this project, work out the answers to the questions below and record them here. Skip any question the user's request already answers, and ask the rest together in one short message rather than one at a time. If the user isn't sure, say which default you'll pick and move on; these can be revisited later.

- What does the app do, in a sentence or two?
- Who will use it: just you, a small group (family, team, friends), or the public? Roughly how many people at the same time?
- Does it need to save data? If so, is it private to each person/device, or shared between users?
- Do users need to log in, or have different permissions?
- How app-like is the interface: mostly pages, content and forms, or a rich interactive UI with many views and lots of client-side state?
- Does it need live updates (seeing other users' changes as they happen), outside services or APIs, or a specific library or language (e.g. a Python data or ML library)?

Based on the answers to these questions, decide on a stack and fill out the section below. Briefly tell the user what you chose and why before building.

Suggested stacks and technologies. These are defaults and guidelines, not strict rules: if the app's needs point somewhere else, use your judgment and note the reasoning in the Stack section. Err on the side of the simplest thing that meets the needs the user described, not ones they might have someday.
 - Frontend: vanilla JS, using Web Components for structure and CSS for styling, loaded as native ES modules with no build step. This keeps iteration fast and has a clear path forward: a few dependencies can come from a CDN as ES modules (pin exact versions, e.g. via an import map); if the dependency list grows, add npm and a bundler (Vite) at that point.
 - Reach for a framework (e.g. React or Svelte with Vite) only when the UI is genuinely complex: many interdependent views and a lot of shared client-side state, or a component library the user specifically wants.
 - No backend if none is needed: static content, or data that only lives on one device (localStorage/IndexedDB). Serve it from a lightweight nginx container.
 - If a backend is needed, keep it small. Node.js is a good default for apps without real scaling needs, because code (validation, data shapes, formatting) can be shared with the frontend. Prefer plain ES modules ("type": "module") and put code used by both sides in shared/, free of DOM- and Node-specific APIs; the server can serve shared/ statically so the browser imports the same files without a bundler. Keep server dependencies minimal (Node's built-in http, or a small framework like Express).
 - Use Go instead when the app expects real load (public, many concurrent users), does heavy concurrent work, or benefits from a single small static binary. Its standard library covers HTTP, JSON and static files without a framework. Use Python (e.g. FastAPI) when the app depends on Python libraries.
 - Storage: match it to the scale. A JSON file is fine for small, rarely-written data with one writer. SQLite is the default for anything more: one file, no extra service, and plenty for a small group of users. Add a database server (PostgreSQL) only for many concurrent writers, multiple backend instances, or features that need it. Whatever holds data must live on a named volume in docker-compose.yml, so it survives rebuilds and restarts.
 - Live updates: Server-Sent Events when data only flows from server to browser, WebSockets when it flows both ways.
 - Logins: avoid them if the users are just the owner or a trusted group. If access must be limited, start with the simplest thing that works (e.g. a single shared password) and only build full accounts when users genuinely need their own identities. Never store plain-text passwords; use an established library for hashing and sessions.
 - The app should be designed to serve from a single container where possible, with frontend content served by the backend when there is one. Extra services (a database server, a worker) go in the same docker-compose.yml.

## Stack

This application runs in the browser, and should be served from a container. A Dockerfile and docker-compose.yml file should be created in the root of the repository.
Fill in the rest of this section based on the answers in the first section.

- TBD

## File structure

- Dockerfile - configure this to serve the app from a container
- docker-compose.yml - configure this to serve the app from a container. Publish the host port through the \`\${HOST_PORT}\` environment variable (see "Running the app in Loop" below) rather than hard-coding one.
- frontend/ - should contain front end code
- backend/ - should contain backend code, if necessary
- shared/ - code used by both frontend and backend, if there is a Node backend

${SHARED_FOOTER}`,
  },
];

const TEMPLATE_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

// Public list for the API — only the fields the UI needs to render the picker.
export function listTemplates() {
  return TEMPLATES.map(({ id, name }) => ({ id, name }));
}

// Initial CLAUDE.md contents for a template, falling back to the blank template.
export function getTemplateClaudeMd(id) {
  const template = TEMPLATE_BY_ID.get(id) || TEMPLATE_BY_ID.get('blank');
  return template ? template.claudeMd : '';
}
