import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import {
  safeReturnTo, startGitHubLogin, completeGitHubLogin, getUser, requireUser, logout
} from '../src/lib/server/auth.js';

const ORIGIN = 'https://triples.love';
const STATE_COOKIE = '__Host-triples_oauth';
const SESSION_COOKIE = '__Host-triples_session';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('../migrations/0001_claim.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() { return sqlite.prepare(sql).get(...values) ?? null; },
            async run() { return sqlite.prepare(sql).run(...values); }
          };
        }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    }
  };
  const jar = new Map();
  const writtenCookies = [];
  const githubRequests = [];
  const profile = { id: 42, login: 'wav-maker', name: 'A WAV' };
  function event(path = '/auth/github?returnTo=%2Fp%2Fapollo%2Fedit', options = {}) {
    const url = new URL(path, ORIGIN);
    const method = options.method ?? 'GET';
    const headers = new Headers(options.headers);
    const responseHeaders = new Map();
    return {
      url,
      locals: { env: {
        DB: db, APP_ORIGIN: options.appOrigin ?? ORIGIN,
        GITHUB_CLIENT_ID: 'test-id', GITHUB_CLIENT_SECRET: 'test-secret'
      } },
      request: new Request(url, { method, headers }),
      cookies: {
        get(name) { return jar.get(name); },
        set(name, value, settings) { jar.set(name, value); writtenCookies.push({ name, value, settings }); },
        delete(name, settings) { jar.delete(name); writtenCookies.push({ name, value: '', settings }); }
      },
      setHeaders(values) { for (const [name, value] of Object.entries(values)) responseHeaders.set(name, value); },
      responseHeaders,
      async fetch(url, options) {
        githubRequests.push({ url, options });
        if (url === 'https://github.com/login/oauth/access_token') {
          return Response.json({ access_token: 'test-github-access-token', token_type: 'bearer' });
        }
        if (url === 'https://api.github.com/user') return Response.json(profile);
        throw new Error('Unexpected upstream request');
      }
    };
  }
  return { sqlite, jar, writtenCookies, githubRequests, profile, event };
}

async function redirected(work, expectedLocation) {
  try {
    await work();
  } catch (err) {
    if (!isRedirect(err)) throw err;
    assert.equal(err.status, 303);
    if (expectedLocation !== undefined) assert.equal(err.location, expectedLocation);
    return err.location;
  }
  assert.fail('expected a redirect');
}

async function rejectsStatus(work, status) {
  await assert.rejects(work, (err) => isHttpError(err, status));
}

async function signIn(f) {
  await redirected(() => startGitHubLogin(f.event()));
  const state = f.jar.get(STATE_COOKIE);
  await redirected(() => completeGitHubLogin(f.event(`/auth/github/callback?state=${state}&code=github-code`)), '/p/apollo/edit');
  return state;
}

test('return destinations stay on-site and cannot point back into auth routes', () => {
  for (const value of [
    null, '', 'https://evil.example', '//evil.example', '/\\evil.example', '/\tevil.example',
    '/a/..//outside.example', '/auth/github', '/auth', '/p/../auth/github'
  ]) {
    assert.equal(safeReturnTo(value, ORIGIN), '/', String(value));
  }
  assert.equal(safeReturnTo('/p/apollo/edit?lang=ko#intro', ORIGIN), '/p/apollo/edit?lang=ko#intro');
});

test('OAuth uses a hashed state, S256 PKCE, restricted cookies and no repo or email scopes', async (t) => {
  const f = fixture(t);
  const request = f.event('/auth/github?returnTo=%2F%2Foutside.example');
  const location = new URL(await redirected(() => startGitHubLogin(request)));
  assert.equal(location.origin + location.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(location.searchParams.get('scope'), '');
  assert.equal(location.searchParams.get('redirect_uri'), `${ORIGIN}/auth/github/callback`);
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  const row = f.sqlite.prepare('SELECT * FROM oauth_states').get();
  assert.notEqual(row.state_hash, f.jar.get(STATE_COOKIE));
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.code_verifier))).toString('base64url');
  assert.equal(location.searchParams.get('code_challenge'), challenge);
  assert.deepEqual(f.writtenCookies.at(-1).settings, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
  assert.equal(request.responseHeaders.get('cache-control'), 'no-store');
  assert.equal(row.return_to, '/');
  const state = location.searchParams.get('state');
  await redirected(() => completeGitHubLogin(f.event(`/auth/github/callback?state=${state}&code=github-code`)), '/');
});

test('preview login redirects to canonical host without writing state or cookies', async (t) => {
  const f = fixture(t);
  const request = f.event('https://preview.example/auth/github?returnTo=%2Fp%2Fapollo', { appOrigin: 'https://canonical.example' });
  await redirected(() => startGitHubLogin(request), 'https://canonical.example/auth/github?returnTo=%2Fp%2Fapollo');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM oauth_states').get().n, 0);
  assert.equal(f.jar.size, 0);
});

test('preview login rejects an invalid APP_ORIGIN before writing state or cookies', async (t) => {
  const f = fixture(t);
  for (const appOrigin of ['http://canonical.example', 'https://canonical.example/path']) {
    const request = f.event('https://preview.example/auth/github', { appOrigin });
    await rejectsStatus(() => startGitHubLogin(request), 503);
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM oauth_states').get().n, 0);
  assert.equal(f.writtenCookies.length, 0);
});

test('OAuth initiation is limited per hashed client address before any state or cookie is issued', async (t) => {
  const f = fixture(t);
  const request = () => ({ ...f.event(), getClientAddress: () => '203.0.113.9' });
  for (let i = 0; i < 30; i++) {
    f.jar.clear();
    await redirected(() => startGitHubLogin(request()));
  }
  f.jar.clear();
  const cookiesBefore = f.writtenCookies.length;
  await rejectsStatus(() => startGitHubLogin(request()), 429);
  assert.equal(f.jar.size, 0);
  assert.equal(f.writtenCookies.length, cookiesBefore);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM oauth_states').get().n, 30);
  const limit = f.sqlite.prepare('SELECT * FROM rate_limits').get();
  const hashedAddress = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('203.0.113.9'))).toString('base64url');
  assert.equal(limit.key, `oauth:${hashedAddress}`);
  assert.ok(!limit.key.includes('203.0.113.9'));
  assert.ok(limit.reset_at <= Date.now() + 600_000);
  // A separate address still works, and expiry restores the original address.
  await redirected(() => startGitHubLogin({ ...f.event(), getClientAddress: () => '203.0.113.10' }));
  f.sqlite.prepare('UPDATE rate_limits SET reset_at = 0 WHERE key = ?').run(limit.key);
  await redirected(() => startGitHubLogin(request()));
});

test('callback rejects a mismatched browser state without making GitHub requests', async (t) => {
  const f = fixture(t);
  await redirected(() => startGitHubLogin(f.event()));
  await rejectsStatus(() => completeGitHubLogin(f.event(`/auth/github/callback?state=${'x'.repeat(43)}&code=code`)), 400);
  assert.equal(f.githubRequests.length, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM oauth_states').get().n, 1);
});

test('expired OAuth states and cancelled sign-ins never establish a session', async (t) => {
  const f = fixture(t);
  await redirected(() => startGitHubLogin(f.event()));
  const expired = f.jar.get(STATE_COOKIE);
  f.sqlite.exec('UPDATE oauth_states SET expires_at = 0');
  await rejectsStatus(() => completeGitHubLogin(f.event(`/auth/github/callback?state=${expired}&code=code`)), 400);
  await redirected(() => startGitHubLogin(f.event()));
  const cancelled = f.jar.get(STATE_COOKIE);
  await rejectsStatus(() => completeGitHubLogin(f.event(`/auth/github/callback?state=${cancelled}&error=access_denied`)), 400);
  assert.equal(f.githubRequests.length, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM oauth_states').get().n, 0);
});

test('successful sign-in exchanges PKCE server-side, stores only a hashed session and consumes state once', async (t) => {
  const f = fixture(t);
  const usedState = await signIn(f);
  const session = f.sqlite.prepare('SELECT * FROM sessions').get();
  const rawSession = f.jar.get(SESSION_COOKIE);
  assert.notEqual(session.token_hash, rawSession);
  assert.equal(session.token_hash, Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawSession))).toString('base64url'));
  assert.ok(session.expires_at > Date.now() + 29 * 86400_000);
  const user = await getUser(f.event('/p/apollo/edit'));
  assert.equal(user.handle, 'wav-maker');
  assert.equal(user.displayName, 'A WAV');
  assert.equal(Object.keys(user).length, 4);
  assert.deepEqual(f.writtenCookies.find(({ name, value }) => name === SESSION_COOKIE && value).settings, {
    path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 86400
  });
  assert.equal(f.githubRequests[0].options.body.get('client_secret'), 'test-secret');
  assert.match(f.githubRequests[0].options.body.get('code_verifier'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(f.githubRequests[1].options.headers.Authorization, 'Bearer test-github-access-token');
  assert.ok(f.githubRequests.every(request => request.options.redirect === 'manual'));
  assert.equal(f.githubRequests[0].options.credentials, 'omit');
  assert.ok(!JSON.stringify([...f.jar]).includes('test-github-access-token'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM oauth_states').get().n, 0);
  f.jar.set(STATE_COOKIE, usedState);
  await rejectsStatus(() => completeGitHubLogin(f.event(`/auth/github/callback?state=${usedState}&code=github-code`)), 400);
  assert.equal(f.githubRequests.length, 2);
});

test('GitHub handle changes keep the same user and replace the current browser session', async (t) => {
  const f = fixture(t);
  await signIn(f);
  const originalUser = await getUser(f.event());
  const oldSession = f.jar.get(SESSION_COOKIE);
  f.profile.login = 'renamed-wav';
  await signIn(f);
  const renamed = await getUser(f.event());
  assert.equal(renamed.id, originalUser.id);
  assert.equal(renamed.handle, 'renamed-wav');
  assert.notEqual(f.jar.get(SESSION_COOKIE), oldSession);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
  f.jar.set(SESSION_COOKIE, oldSession);
  assert.equal(await getUser(f.event()), null);
});

test('expired and malformed session cookies are rejected and cleared', async (t) => {
  const f = fixture(t);
  await signIn(f);
  f.sqlite.exec('UPDATE sessions SET expires_at = 0');
  assert.equal(await getUser(f.event()), null);
  assert.equal(f.jar.has(SESSION_COOKIE), false);
  f.jar.set(SESSION_COOKIE, 'malformed');
  assert.equal(await getUser(f.event()), null);
  assert.equal(f.jar.has(SESSION_COOKIE), false);
});

test('logout rejects cross-origin and missing-Origin submissions then revokes a valid session', async (t) => {
  const f = fixture(t);
  await signIn(f);
  await rejectsStatus(() => logout(f.event('/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example' } })), 403);
  await rejectsStatus(() => logout(f.event('/auth/logout', { method: 'POST' })), 403);
  assert.ok(await getUser(f.event()));
  await redirected(() => logout(f.event('/auth/logout', { method: 'POST', headers: { Origin: ORIGIN } })), '/');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal(f.jar.has(SESSION_COOKIE), false);
});

test('upstream OAuth errors consume state without leaking credentials or creating sessions', async (t) => {
  const f = fixture(t);
  await redirected(() => startGitHubLogin(f.event()));
  const request = f.event(`/auth/github/callback?state=${f.jar.get(STATE_COOKIE)}&code=code`);
  request.fetch = async () => { throw new Error('test-secret in upstream failure'); };
  await assert.rejects(() => completeGitHubLogin(request), (err) => {
    assert.ok(isHttpError(err, 502));
    assert.ok(!JSON.stringify(err).includes('test-secret'));
    return true;
  });
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM oauth_states').get().n, 0);
});

test('GitHub token and profile redirects are rejected without creating a session', async (t) => {
  for (const endpoint of ['https://github.com/login/oauth/access_token', 'https://api.github.com/user']) {
    const f = fixture(t);
    await redirected(() => startGitHubLogin(f.event()));
    const request = f.event(`/auth/github/callback?state=${f.jar.get(STATE_COOKIE)}&code=code`);
    const originalFetch = request.fetch;
    let requests = 0;
    request.fetch = async (url, options) => {
      requests++;
      assert.equal(options.redirect, 'manual');
      if (url === endpoint) return Response.redirect('https://unexpected.example/', 302);
      return originalFetch(url, options);
    };
    await rejectsStatus(() => completeGitHubLogin(request), 502);
    assert.equal(requests, endpoint.endsWith('/user') ? 2 : 1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
    assert.equal(f.jar.has(SESSION_COOKIE), false);
  }
});

test('protected pages return to the requested page after authentication', async (t) => {
  const f = fixture(t);
  await redirected(() => requireUser(f.event('/p/apollo/edit?lang=ko')), '/auth/github?returnTo=%2Fp%2Fapollo%2Fedit%3Flang%3Dko');
  await signIn(f);
  assert.equal((await requireUser(f.event('/p/apollo/edit'))).handle, 'wav-maker');
});

test('OAuth logs distinguish endpoint, HTTP, timeout and malformed responses without credentials', async t => {
  const logs = [];
  for (const level of ['info', 'warn', 'error']) t.mock.method(console, level, text => logs.push({ level, ...text }));
  for (const scenario of ['token_http', 'profile_http', 'timeout', 'bad_json', 'invalid_token', 'invalid_profile']) {
    const f = fixture(t);
    await redirected(() => startGitHubLogin(f.event()));
    const request = f.event(`/auth/github/callback?state=${f.jar.get(STATE_COOKIE)}&code=PRIVATE_CODE`);
    const original = request.fetch;
    request.fetch = async (url, options) => {
      if (scenario === 'timeout') throw new DOMException('PRIVATE_TIMEOUT', 'TimeoutError');
      if (scenario === 'bad_json') return new Response('PRIVATE_BAD_JSON');
      if (scenario === 'invalid_token') return Response.json({ access_token: 'PRIVATE_TOKEN' });
      if (scenario === 'invalid_profile' && url.endsWith('/user')) return Response.json({ login: 'PRIVATE_PROFILE' });
      if (scenario === 'token_http' || (scenario === 'profile_http' && url.endsWith('/user'))) return new Response('PRIVATE_UPSTREAM_BODY', { status: 503 });
      return original(url, options);
    };
    const before = logs.length;
    await rejectsStatus(() => completeGitHubLogin(request), 502);
    assert.equal(logs.length, before + 1);
    const log = logs.at(-1);
    assert.equal(log.level, 'error');
    assert.equal(log.operation, scenario.startsWith('profile') || scenario === 'invalid_profile' ? 'oauth.profile' : 'oauth.token_exchange');
    assert.equal(log.error_code, { token_http: 'upstream_http', profile_http: 'upstream_http', timeout: 'timeout', bad_json: 'invalid_response', invalid_token: 'invalid_token_response', invalid_profile: 'invalid_profile' }[scenario]);
    if (scenario.endsWith('_http')) assert.equal(log.upstream_status, 503);
    assert.equal(f.jar.has(SESSION_COOKIE), false);
    assert.ok(!JSON.stringify(logs).includes('PRIVATE'));
    assert.ok(!JSON.stringify(logs).includes(f.jar.get(STATE_COOKIE) ?? 'NEVER_LOG_THIS'));
    assert.ok(!JSON.stringify(logs).includes('test-secret'));
  }
});
