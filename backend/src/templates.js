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
    id: 'vite-react',
    name: 'Vite + React',
    claudeMd: `# CLAUDE.md

This file gives Claude Code guidance for working in this project.

## Stack

- **Vite** dev server and bundler.
- **React** with TypeScript.

## Conventions

- Components live under \`src/\`; keep one component per file.
- Run \`npm run build\` to confirm the build passes before finishing. The user
  runs the app through the root \`docker-compose.yml\` (see below), not
  \`npm run dev\`.
${SHARED_FOOTER}`,
  },
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    claudeMd: `# CLAUDE.md

This file gives Claude Code guidance for working in this project.

## Stack

- **SvelteKit** with TypeScript.

## Conventions

- Routes live under \`src/routes/\` using SvelteKit's file-based routing.
- Shared code goes in \`src/lib/\` (import via \`$lib\`).
- Run \`npm run build\` to verify before finishing. The user runs the app
  through the root \`docker-compose.yml\` (see below), not \`npm run dev\`.
${SHARED_FOOTER}`,
  },
  {
    id: 'astro',
    name: 'Astro',
    claudeMd: `# CLAUDE.md

This file gives Claude Code guidance for working in this project.

## Stack

- **Astro** for content-focused, mostly-static sites.

## Conventions

- Pages live under \`src/pages/\`; components under \`src/components/\`.
- Ship zero client JS by default; add a framework island only when a piece of
  UI genuinely needs interactivity.
- Run \`npm run build\` to verify before finishing. The user runs the app
  through the root \`docker-compose.yml\` (see below), not \`npm run dev\`.
${SHARED_FOOTER}`,
  },
  {
    id: 'remix',
    name: 'Remix',
    claudeMd: `# CLAUDE.md

This file gives Claude Code guidance for working in this project.

## Stack

- **Remix** with React and TypeScript.

## Conventions

- Routes live under \`app/routes/\` using Remix's file-based routing with
  \`loader\`/\`action\` data functions.
- Prefer Remix's built-in data loading over client-side fetching.
- Run \`npm run build\` to verify before finishing. The user runs the app
  through the root \`docker-compose.yml\` (see below), not \`npm run dev\`.
${SHARED_FOOTER}`,
  },
  {
    id: 'rust-cli',
    name: 'Rust CLI (clap)',
    claudeMd: `# CLAUDE.md

This file gives Claude Code guidance for working in this project.

## Stack

- **Rust** command-line application using **clap** for argument parsing.

## Conventions

- Source lives under \`src/\`; the entry point is \`src/main.rs\`.
- Define the CLI with clap's derive API.
- Run \`cargo run\` to try it, \`cargo build\` to compile, \`cargo test\` for
  tests, and \`cargo clippy\` to lint before finishing.
${SHARED_FOOTER}`,
  },
  {
    id: 'fastapi-postgres',
    name: 'FastAPI + Postgres',
    claudeMd: `# CLAUDE.md

This file gives Claude Code guidance for working in this project.

## Stack

- **FastAPI** (Python) backed by **PostgreSQL**.

## Conventions

- Application code lives under \`app/\`; define routes with FastAPI routers.
- Use Pydantic models for request/response schemas.
- The root \`docker-compose.yml\` runs the app (\`uvicorn app.main:app\`) and a
  Postgres \`db\` service; keep the database's host port unpublished.
- Keep database access in a dedicated layer rather than inline in route handlers.
${SHARED_FOOTER}`,
  },
  {
    id: 'expo',
    name: 'Expo (React Native)',
    claudeMd: `# CLAUDE.md

This file gives Claude Code guidance for working in this project.

## Stack

- **Expo** / **React Native** with TypeScript.

## Conventions

- Screens and components live under \`app/\` (Expo Router) or \`src/\`.
- Use Expo SDK modules instead of bare native modules where possible.
- Run \`npx expo start\` to launch the dev server.
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
