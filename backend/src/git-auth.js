// GitHub authentication: acts as the "VybLoop" GitHub App when configured,
// otherwise falls back to a Personal Access Token ("PAT mode").
//
// App mode mints short-lived *installation access tokens* on demand (they
// expire ~1h), so callers must never cache them in a remote URL — the git
// credential broker (git-credential-broker.js) requests a fresh one per git op.
import { readFileSync, existsSync } from 'fs';
import { createSign } from 'crypto';

const APP_ID = process.env.GITHUB_APP_ID || '';
const APP_SLUG = process.env.GITHUB_APP_SLUG || 'vybloop';
const PRIVATE_KEY_PATH = process.env.GITHUB_APP_PRIVATE_KEY_PATH || '/secrets/vybloop.pem';

// PAT (fallback mode). Sourced from the env or, if not set there, from the value
// persisted in config — data.js pushes that in via setStoredPat().
let storedPat = '';
export function setStoredPat(value) { storedPat = value || ''; }
function patValue() { return process.env.GITHUB_TOKEN || storedPat || ''; }
function patFromEnv() { return !!process.env.GITHUB_TOKEN; }

let privateKeyCache = null;
function readPrivateKey() {
  if (privateKeyCache !== null) return privateKeyCache;
  try {
    privateKeyCache = APP_ID && existsSync(PRIVATE_KEY_PATH)
      ? readFileSync(PRIVATE_KEY_PATH, 'utf8')
      : '';
  } catch (e) {
    console.error('[git-auth] failed to read private key:', e.message);
    privateKeyCache = '';
  }
  return privateKeyCache;
}

export function appConfigured() {
  return !!(APP_ID && readPrivateKey());
}

// --- App JWT (RS256, no external dependency) -------------------------------

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function generateJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  // Backdate iat by 60s to tolerate clock skew; GitHub caps exp at 10 min.
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: APP_ID }));
  const signingInput = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(readPrivateKey()).toString('base64url');
  return `${signingInput}.${signature}`;
}

async function ghApp(path, options = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${generateJwt()}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'loop-app',
      ...(options.headers || {}),
    },
  });
}

// --- Installations & installation tokens (cached) --------------------------

let installationsCache = { data: null, fetchedAt: 0 };
const INSTALL_TTL_MS = 60_000;

async function getInstallations() {
  if (installationsCache.data && Date.now() - installationsCache.fetchedAt < INSTALL_TTL_MS) {
    return installationsCache.data;
  }
  const resp = await ghApp('/app/installations');
  if (!resp.ok) throw new Error(`list installations failed (${resp.status})`);
  const data = await resp.json();
  installationsCache = { data, fetchedAt: Date.now() };
  return data;
}

const tokenCache = new Map(); // installationId -> { token, expiresAt }

async function getInstallationToken(id) {
  const cached = tokenCache.get(id);
  // Refresh while >5 min of life remains so a long git op never races expiry.
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
  const resp = await ghApp(`/app/installations/${id}/access_tokens`, { method: 'POST' });
  if (!resp.ok) throw new Error(`installation token failed (${resp.status})`);
  const data = await resp.json();
  tokenCache.set(id, { token: data.token, expiresAt: new Date(data.expires_at).getTime() });
  return data.token;
}

async function findInstallationForOwner(owner) {
  const lower = (owner || '').toLowerCase();
  const installs = await getInstallations();
  return installs.find(i => i.account?.login?.toLowerCase() === lower) || null;
}

// --- Public: credentials for git over HTTPS --------------------------------

// Returns { username, password } for the given repo owner, or null if we have
// no way to authenticate. App mode uses an installation token; PAT mode uses
// the token as the username (GitHub accepts either field).
export async function getCredentialForOwner(owner) {
  if (appConfigured()) {
    try {
      const inst = await findInstallationForOwner(owner);
      if (inst) {
        const token = await getInstallationToken(inst.id);
        return { username: 'x-access-token', password: token };
      }
      console.warn(`[git-auth] no installation grants access to "${owner}"`);
    } catch (e) {
      console.error('[git-auth] app credential error:', e.message);
    }
  }
  const pat = patValue();
  if (pat) return { username: pat, password: 'x-oauth-basic' };
  return null;
}

// --- Public: status for the settings UI ------------------------------------

function manageUrlFor(install) {
  return install.account?.type === 'Organization'
    ? `https://github.com/organizations/${install.account.login}/settings/installations/${install.id}`
    : `https://github.com/settings/installations/${install.id}`;
}

export async function getGithubStatus() {
  const installUrl = `https://github.com/apps/${APP_SLUG}/installations/new`;
  const pat = { configured: !!patValue(), fromEnv: patFromEnv() };

  if (appConfigured()) {
    let installations = [];
    let error = null;
    try {
      installations = (await getInstallations()).map(i => ({
        id: i.id,
        account: i.account?.login,
        type: i.account?.type,
        manageUrl: manageUrlFor(i),
        canCreateRepos: i.account?.type === 'Organization' && i.permissions?.administration === 'write',
      }));
    } catch (e) {
      error = e.message;
    }
    return {
      mode: 'app',
      slug: APP_SLUG,
      appId: APP_ID,
      installUrl,
      installations,
      canCreateRepos: installations.some(i => i.canCreateRepos),
      error,
      pat,
    };
  }

  return {
    mode: pat.configured ? 'pat' : 'none',
    slug: APP_SLUG,
    installUrl,
    installations: [],
    canCreateRepos: pat.configured, // a PAT can create repos under /user/repos
    pat,
  };
}

// --- Public: create a repository (used by the new-project flow) ------------

async function ghJson(url, token, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'loop-app',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) return { error: data.message || 'Failed to create repository' };
  return { url: data.clone_url, htmlUrl: data.html_url };
}

export async function createRepo({ name, isPrivate = false }) {
  const body = { name, private: isPrivate, auto_init: true };
  if (appConfigured()) {
    const status = await getGithubStatus();
    const orgInstall = status.installations.find(i => i.canCreateRepos);
    if (!orgInstall) {
      return { error: 'The GitHub App cannot create repositories here. Create the repo on GitHub (or install the app on an organization with Administration access) and paste its URL instead.' };
    }
    const token = await getInstallationToken(orgInstall.id);
    return ghJson(`https://api.github.com/orgs/${orgInstall.account}/repos`, token, body);
  }
  const pat = patValue();
  if (!pat) return { error: 'No GitHub credentials configured' };
  return ghJson('https://api.github.com/user/repos', pat, body);
}
