import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { getTimezone, getAgentCli } from './data.js';
import { AGENTS_MOUNT } from './agent-toolchain.js';
import { IMAGE_PLACEHOLDER } from './sandbox-image.js';

// CODEX_HOME lives under /claudeconfig — the same mount Claude Code's config
// uses — so a `codex login` inside one throwaway agent container survives into
// the next one.
const CODEX_HOME = '/claudeconfig/codex';
const CODEX_CONFIG = `${CODEX_HOME}/config.toml`;
const CODEX_AGENTS_MD = `${CODEX_HOME}/AGENTS.md`;
const NOTIFY_SCRIPT = '/claudeconfig/loop-notify-done.sh';

// Sandbox rules the agent needs regardless of which CLI is driving. Claude Code
// takes them via --append-system-prompt; Codex has no such flag, so they are
// written to $CODEX_HOME/AGENTS.md, which it loads as global instructions.
export const AGENT_INSTRUCTIONS = [
  'You are running inside a Linux sandbox container.',
  'You may freely install any Linux tools or packages you need (e.g. via apt-get, pip, npm, cargo, etc.).',
  'You cannot run Docker or Podman containers directly inside this sandbox.',
  'If the project has a docker-compose.yml at the repo root, instruct the user to start or restart the app using the "Run" or "Restart" button in the Loop UI — do not attempt to run compose yourself.',
  'Tools the project needs in every session (system packages, SDKs, CLIs) belong in `.loop/sandbox.Dockerfile`: a Dockerfile fragment of RUN/ENV/COPY lines (no FROM — Loop layers it on the base sandbox image, with `.loop/` as the build context) that is built once and cached, so new sessions and workstreams start with the tools already installed. Prefer it over setup scripts. When you add something there, also install it in this session so you can keep working; the image is rebuilt the next time the sandbox starts, so tell the user to restart the sandbox from the Loop menu to verify the build. Keep each RUN self-contained (e.g. `apt-get update && apt-get install -y …`).',
  'Loop also has a shared library of tool layers, listed with their Dockerfile fragments in /claudeconfig/loop-sandbox-layers.json. Before writing an install yourself, check it: if a layer covers what you need, add its id to `.loop/sandbox.json` as `{ "use": ["<id>", …] }` instead of copying the fragment. Use the fragment only for what the library lacks.',
  'Compose files must never hard-code a host port: the host port is assigned automatically and passed in as the HOST_PORT environment variable, so publish ports as "${HOST_PORT}:<container port>".',
  'To share a file with the user, run `sh /claudeconfig/loop-share.sh <file-or-directory> [caption]` — it appears in a side panel in the Loop UI, where images are previewed and anything else can be downloaded. Use it whenever a picture (e.g. a screenshot) explains the result better than text, and to hand over deliverables such as a built app, installer, binary, PDF or data export. Sharing a directory archives it first (zip), so share the build output directory (e.g. dist/), not the whole repo or node_modules.',
];

// nano is installed in claude-inner and set as git's core.editor; exporting it
// here too makes every other tool that consults $EDITOR/$VISUAL agree.
export const EDITOR_ENV = ['--env', 'EDITOR=nano', '--env', 'VISUAL=nano'];

// Env every agent container gets, whichever CLI runs in it.
function commonEnv(projectId) {
  return [
    '--env', 'GIT_CONFIG_GLOBAL=/claudeconfig/gitconfig',
    '--env', 'IS_SANDBOX=1',
    '--env', 'COLORTERM=truecolor',
    ...EDITOR_ENV,
    '--env', `TZ=${getTimezone()}`,
    '--env', `LOOP_PROJECT_ID=${projectId}`,
  ];
}

const AGENT_COMMANDS = {
  claude: (repoPath, projectId) => [
    'podman', 'run', '--rm', '-it',
    '-v', `${repoPath}:/project`,
    '-v', '/claudeconfig:/claudeconfig',
    ...AGENTS_MOUNT,
    '--env', 'CLAUDE_CONFIG_DIR=/claudeconfig',
    '--env', 'ANTHROPIC_API_KEY',
    // The CLI lives on a read-only shared volume (agent-toolchain.js); updates
    // go through Loop's "Update agent CLIs", not Claude Code's own updater.
    '--env', 'DISABLE_AUTOUPDATER=1',
    ...commonEnv(projectId),
    '-w', '/project',
    IMAGE_PLACEHOLDER,
    'claude', '--dangerously-skip-permissions',
    '--append-system-prompt', AGENT_INSTRUCTIONS.join(' '),
  ],
  // The container is already the sandbox, so Codex's own sandbox and approval
  // prompts would only get in the way — bypassing them is the Codex equivalent
  // of --dangerously-skip-permissions above.
  codex: (repoPath, projectId) => [
    'podman', 'run', '--rm', '-it',
    '-v', `${repoPath}:/project`,
    '-v', '/claudeconfig:/claudeconfig',
    ...AGENTS_MOUNT,
    '--env', `CODEX_HOME=${CODEX_HOME}`,
    '--env', 'OPENAI_API_KEY',
    ...commonEnv(projectId),
    '-w', '/project',
    IMAGE_PLACEHOLDER,
    'codex', '--dangerously-bypass-approvals-and-sandbox',
  ],
};

// The `podman run` argv for the agent terminal, for whichever CLI this project
// is set to (its own choice, else the global default). Resolved per session
// start, so two workstreams of the same project can run different CLIs.
export function agentCommand(repoPath, projectId) {
  return AGENT_COMMANDS[getAgentCli(projectId)](repoPath, projectId);
}

// Codex's counterpart to the Claude Code Stop hook + system prompt installed in
// ipc-server.js / server.js. Called at startup so edits here need only a backend
// restart, not a sandbox rebuild.
export function installCodexConfig() {
  mkdirSync(CODEX_HOME, { recursive: true });
  // Loop's project templates write per-project guidance to CLAUDE.md, which
  // Codex does not look for; point it there so both CLIs read the same notes.
  const instructions = [
    ...AGENT_INSTRUCTIONS,
    'If the repository has a CLAUDE.md but no AGENTS.md, read CLAUDE.md and treat it as the project instructions.',
  ];
  writeFileSync(CODEX_AGENTS_MD, `${instructions.join('\n\n')}\n`);

  // `notify` is Codex's agent-turn-complete callback — the closest thing it has
  // to Claude Code's Stop hook, and it feeds the same loop-events socket. The
  // script ignores the JSON payload Codex passes as argv[1].
  const notifyLine = `notify = ["bash", "${NOTIFY_SCRIPT}"]`;
  let existing = '';
  if (existsSync(CODEX_CONFIG)) {
    try { existing = readFileSync(CODEX_CONFIG, 'utf8'); } catch {}
  }
  // Drop a previous notify line rather than appending a duplicate, and keep the
  // key ahead of any [table] headers — a bare key after one belongs to it.
  const rest = existing.split('\n').filter(l => !/^\s*notify\s*=/.test(l)).join('\n').replace(/^\n+/, '');
  writeFileSync(CODEX_CONFIG, rest ? `${notifyLine}\n\n${rest}` : `${notifyLine}\n`);
}
