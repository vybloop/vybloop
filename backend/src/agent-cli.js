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
  'You are in a Linux sandbox container. Install any tools you need (apt-get, pip, npm, cargo…). You cannot run Docker or Podman containers here.',
  'The user works through the Loop web UI and cannot reach anything listening in this sandbox, so a dev server or localhost URL here is invisible to them. They open web apps with the "Run" button in Loop, which runs `compose up --build` on a root docker-compose.yml. So when you build something served over HTTP for a browser (website, web app, browser game, web API) and there is no compose file yet, add a Dockerfile that installs and builds the app and a root docker-compose.yml that serves it, even if not asked, unless CLAUDE.md/AGENTS.md says otherwise. Use one service unless the app needs more (e.g. a database). You cannot run compose here: verify by starting the app in the sandbox and curling it, then tell the user to press "Run" (or "Restart" after changes). Deliverables that are not served (browser extension, CLI, desktop/mobile app, library) need no compose file; build them and share the result (see below).',
  'In new compose files, publish the Loop-assigned port as "${HOST_PORT}:<container port>" (a `network_mode: host` service instead listens on ${HOST_PORT} itself, passed via `environment:`). Leave existing port mappings alone unless asked.',
  'Tools needed in every session belong in `.loop/sandbox.Dockerfile`, not setup scripts: a Dockerfile fragment (RUN/ENV/COPY, no FROM; build context `.loop/`) that Loop layers on the base image and caches. Keep each RUN self-contained (`apt-get update && apt-get install -y …`). Also install the tool in this session; the image rebuilds on the next sandbox start, so ask the user to restart the sandbox from the Loop menu to verify the build.',
  'Before writing a fragment, check the shared layer library in /claudeconfig/loop-sandbox-layers.json; to use a layer, add its id to `.loop/sandbox.json` (`{ "use": ["<id>"] }`) instead of copying it.',
  'To show or hand over a file, run `sh /claudeconfig/loop-share.sh <file-or-dir> [caption]`; it appears in a Loop side panel (images previewed, others downloadable). Use it for screenshots that explain a result and for deliverables (built apps, binaries, PDFs, exports). Directories are zipped, so share the build output (e.g. dist/), not the repo or node_modules.',
];

// Hardware virtualisation, when the host has it. app-entrypoint.sh makes the
// node usable by rootless podman; every sandbox (agent and shell) gets it so
// QEMU etc. can use -accel kvm. Compose services must ask for it themselves.
const HAS_KVM = existsSync('/dev/kvm');
export const KVM_DEVICE = HAS_KVM ? ['--device', '/dev/kvm'] : [];
if (HAS_KVM) {
  AGENT_INSTRUCTIONS.push('/dev/kvm is available, so VMs can use KVM acceleration (e.g. QEMU `-accel kvm`); a compose service needs `devices: ["/dev/kvm:/dev/kvm"]` for it.');
}

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
    ...KVM_DEVICE,
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
