import { error, redirect } from '@sveltejs/kit';
import { consumeRateLimit, getDb } from './db.js';
import { recordResult } from './observability.js';

function authFailure(event, operation, code, status, message, extras) {
  recordResult(event, operation, status, code, extras);
  error(status, message);
}

const SESSION_COOKIE = '__Host-triples_session';
const STATE_COOKIE = '__Host-triples_oauth';
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const STATE_SECONDS = 10 * 60;
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const COOKIE_OPTIONS = { path: '/', httpOnly: true, secure: true, sameSite: 'lax' };

function randomToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function hashToken(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

function authConfig(event, needsCredentials = true) {
  const env = event.platform?.env;
  let origin;
  try {
    const url = new URL(env?.APP_ORIGIN);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Invalid origin');
    }
    origin = url.origin;
  } catch {
    authFailure(event, 'auth.config', 'invalid_origin', 503, 'Sign-in is not configured yet.');
  }
  if (needsCredentials && (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET)) {
    authFailure(event, 'auth.config', 'credentials_missing', 503, 'GitHub sign-in is not configured yet.');
  }
  return {
    origin,
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    callback: `${origin}/auth/github/callback`
  };
}

/** Only an absolute path on this site can be an OAuth return destination. */
export function safeReturnTo(value, origin) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) {
    return '/';
  }
  try {
    const target = new URL(value, origin);
    if (target.origin !== origin || target.pathname === '/auth' || target.pathname.startsWith('/auth/')) return '/';
    return target.pathname + target.search + target.hash;
  } catch {
    return '/';
  }
}

function noStore(event) {
  event.setHeaders({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
}

function publicUser(row) {
  return { id: row.id, handle: row.handle, displayName: row.display_name, avatarUrl: row.avatar_url };
}

export async function getUser(event) {
  const token = event.cookies.get(SESSION_COOKIE);
  if (!token) return null;
  if (!OPAQUE_TOKEN.test(token)) {
    event.cookies.delete(SESSION_COOKIE, COOKIE_OPTIONS);
    return null;
  }
  const user = await getDb(event, 'session.read').prepare(`
    SELECT users.id, users.handle, users.display_name, users.avatar_url
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(await hashToken(token), Date.now()).first();
  if (!user) {
    event.cookies.delete(SESSION_COOKIE, COOKIE_OPTIONS);
    return null;
  }
  return publicUser(user);
}

export async function requireUser(event) {
  const user = Object.hasOwn(event.locals ?? {}, 'user') ? event.locals.user : await getUser(event);
  if (user) return user;
  const returnTo = safeReturnTo(event.url.pathname + event.url.search, event.url.origin);
  redirect(303, `/auth/github?${new URLSearchParams({ returnTo })}`);
}

export async function startGitHubLogin(event) {
  noStore(event);
  const config = authConfig(event);
  const returnTo = safeReturnTo(event.url.searchParams.get('returnTo'), config.origin);
  // Cookies and callbacks belong to the canonical host, including from previews.
  if (event.url.origin !== config.origin) {
    redirect(303, `${config.origin}/auth/github?${new URLSearchParams({ returnTo })}`);
  }
  const db = getDb(event, 'oauth.state');
  // SvelteKit supplies this address in production. The fallback is for test events.
  const clientAddress = typeof event.getClientAddress === 'function' ? event.getClientAddress() : 'test';
  await consumeRateLimit(db, `oauth:${await hashToken(clientAddress)}`, 30, STATE_SECONDS * 1000);
  const state = randomToken();
  const verifier = randomToken();
  const now = Date.now();
  const oldState = event.cookies.get(STATE_COOKIE);
  const statements = [db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(now)];
  if (oldState && OPAQUE_TOKEN.test(oldState)) {
    statements.push(db.prepare('DELETE FROM oauth_states WHERE state_hash = ?').bind(await hashToken(oldState)));
  }
  statements.push(db.prepare(`
    INSERT INTO oauth_states (state_hash, code_verifier, return_to, expires_at) VALUES (?, ?, ?, ?)
  `).bind(await hashToken(state), verifier, returnTo, now + STATE_SECONDS * 1000));
  await db.batch(statements);
  event.cookies.set(STATE_COOKIE, state, { ...COOKIE_OPTIONS, maxAge: STATE_SECONDS });

  const authorization = new URL('https://github.com/login/oauth/authorize');
  authorization.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callback,
    scope: '',
    state,
    code_challenge: await hashToken(verifier),
    code_challenge_method: 'S256'
  }).toString();
  recordResult(event, 'oauth.start', 303);
  redirect(303, authorization.href);
}

async function githubJson(event, operation, url, options) {
  const start = performance.now();
  let upstreamStatus;
  let failure = 'network_failed';
  const signal = AbortSignal.timeout(10_000);
  try {
    const response = await event.fetch(url, {
      ...options, credentials: 'omit', redirect: 'manual', signal
    });
    upstreamStatus = response.status;
    failure = 'upstream_http';
    if (!response.ok) throw new Error();
    failure = 'invalid_response';
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch (cause) {
    if (signal.aborted || cause?.name === 'TimeoutError') failure = 'timeout';
    authFailure(event, operation, failure, 502,
      'GitHub sign-in could not be completed. Please try again.',
      { upstream_status: upstreamStatus, operation_ms: performance.now() - start });
  }
}

export async function completeGitHubLogin(event) {
  noStore(event);
  const config = authConfig(event);
  if (event.url.origin !== config.origin) authFailure(event, 'oauth.callback', 'wrong_origin', 400, 'Use the sign-in link on triples.love.');
  const state = event.url.searchParams.get('state');
  const cookieState = event.cookies.get(STATE_COOKIE);
  if (!state || !OPAQUE_TOKEN.test(state) || !cookieState || state !== cookieState) {
    authFailure(event, 'oauth.callback', 'state_mismatch', 400, 'This sign-in request is invalid or expired. Please start again.');
  }
  event.cookies.delete(STATE_COOKIE, COOKIE_OPTIONS);
  let db = getDb(event, 'oauth.state');
  // DELETE RETURNING consumes the state atomically, so a callback cannot be replayed.
  const attempt = await db.prepare(`
    DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > ?
    RETURNING code_verifier, return_to
  `).bind(await hashToken(state), Date.now()).first();
  if (!attempt) authFailure(event, 'oauth.callback', 'state_expired', 400, 'This sign-in request is invalid or expired. Please start again.');
  if (event.url.searchParams.has('error')) authFailure(event, 'oauth.callback', 'cancelled', 400, 'GitHub sign-in was cancelled. You can try again.');
  const code = event.url.searchParams.get('code');
  if (!code || code.length > 1024) authFailure(event, 'oauth.callback', 'code_invalid', 400, 'GitHub did not provide a valid sign-in code.');

  const token = await githubJson(event, 'oauth.token_exchange', 'https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callback,
      code_verifier: attempt.code_verifier
    })
  });
  if (typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 8192 || typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer') {
    authFailure(event, 'oauth.token_exchange', 'invalid_token_response', 502, 'GitHub sign-in could not be completed. Please try again.');
  }
  const profile = await githubJson(event, 'oauth.profile', 'https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token.access_token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'triples-love'
    }
  });
  if (!Number.isSafeInteger(profile.id) || profile.id <= 0 || typeof profile.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(profile.login)) {
    authFailure(event, 'oauth.profile', 'invalid_profile', 502, 'GitHub did not return a valid profile. Please try again.');
  }
  const now = Date.now();
  db = getDb(event, 'user.upsert');
  // GitHub's numeric account ID is stable across handle changes.
  const user = await db.prepare(`
    INSERT INTO users (id, github_id, handle, display_name, avatar_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(github_id) DO UPDATE SET
      handle = excluded.handle, display_name = excluded.display_name, avatar_url = excluded.avatar_url
    RETURNING id, handle, display_name, avatar_url
  `).bind(
    crypto.randomUUID(), String(profile.id), profile.login,
    typeof profile.name === 'string' ? profile.name.slice(0, 200) : profile.login,
    `https://avatars.githubusercontent.com/u/${profile.id}?v=4`, now
  ).first();

  db = getDb(event, 'session.create');
  const session = randomToken();
  const statements = [db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now)];
  const previousSession = event.cookies.get(SESSION_COOKIE);
  if (previousSession && OPAQUE_TOKEN.test(previousSession)) {
    statements.push(db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(previousSession)));
  }
  statements.push(db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)
  `).bind(await hashToken(session), user.id, now + SESSION_SECONDS * 1000));
  await db.batch(statements);
  event.cookies.set(SESSION_COOKIE, session, { ...COOKIE_OPTIONS, maxAge: SESSION_SECONDS });
  event.locals.user = publicUser(user);
  recordResult(event, 'oauth.callback', 303);
  redirect(303, safeReturnTo(attempt.return_to, config.origin));
}

export async function logout(event) {
  noStore(event);
  const { origin } = authConfig(event, false);
  if (event.url.origin !== origin || event.request.headers.get('origin') !== origin) {
    authFailure(event, 'session.logout', 'wrong_origin', 403, 'Submit this request from triples.love.');
  }
  const token = event.cookies.get(SESSION_COOKIE);
  if (token && OPAQUE_TOKEN.test(token)) {
    await getDb(event, 'session.delete').prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
  }
  event.cookies.delete(SESSION_COOKIE, COOKIE_OPTIONS);
  event.locals.user = null;
  recordResult(event, 'session.logout', 303);
  redirect(303, '/');
}
