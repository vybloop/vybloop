// Project templates. Each template has an id, a display name, and the contents
// of an initial CLAUDE.md file written into the project when it is created
// without an existing git repository (when a repo URL is given we clone it
// instead and leave its files untouched).

const SHARED_FOOTER = `
## Working in this project

- Keep changes small and focused; explain non-obvious decisions in code comments.
- Match the existing style, naming, and structure of the surrounding code.
- Prefer the project's existing dependencies over adding new ones.
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
- Will the game need to work on mobile browsers?

Based on the answers to these questions, decide on a stack and fill out the section below.

Suggested web stacks and technologies:
 - Vanilla JS, using Web Components for structure and CSS for styling. Avoid bundlers and frameworks unless it offers a clear advantage.
 - If a physics engine seems necessary, use Rapier.js if it seems sufficient for the game's needs.
 - In most cases with any level of graphics, use WebGL for rendering.
 - For multiplayer features, use WebSockets for real-time communication if needed.
 - If a backend is needed, default to using Go unless a specific framework/library seems well-suited
 - The game should be designed to serve from a single container, so frontend content should be served from the same container as any backend code
 - If no backend is needed, use a lightweight nginx container to serve the content

## Stack

This application runs in the browser, and should be served from a container. A Dockerfile and docker-compose.yml file should be created in the root of the repository.
Fill in the rest of this section based on the answers in the first section.

- TBD

## File structure

- Dockerfile - configure this to serve the game from a container
- docker-compose.yml - configure this to serve the game from a container
- frontend/ - should contain front end code
- backend/ - should contain backend code, if necessary

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
- Run \`npm run dev\` during development and \`npm run build\` to confirm the
  build passes before finishing.
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
- Run \`npm run dev\` to develop and \`npm run build\` to verify before finishing.
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
- Run \`npm run dev\` to develop and \`npm run build\` to verify before finishing.
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
- Run \`npm run dev\` to develop and \`npm run build\` to verify before finishing.
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
- Run the dev server with \`uvicorn app.main:app --reload\`.
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
