// Runs the real auth implementation inside workerd with an isolated D1 database.
// GitHub responses are fixtures; no OAuth app, credentials or network are used.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const origin = 'https://triples.love';
const bundle = await build({
  stdin: {
    contents: `
      import { startGitHubLogin, completeGitHubLogin } from './src/lib/server/auth.js';
      export default {
        async fetch(request, env) {
          const incoming = new URL(request.url);
          const url = new URL(incoming.pathname + incoming.search, env.APP_ORIGIN);
          const responseHeaders = new Headers();
          const cookies = new Map((request.headers.get('cookie') || '').split('; ')
            .filter(Boolean).map(cookie => cookie.split('=')));
          const event = {
            url, request, locals: {}, platform: { env },
            getClientAddress: () => '127.0.0.1',
            setHeaders: values => Object.entries(values).forEach(([key,value]) => responseHeaders.set(key,value)),
            cookies: {
              get: name => cookies.get(name),
              set: (name,value) => responseHeaders.append('set-cookie', name + '=' + value + '; Secure; HttpOnly; SameSite=Lax; Path=/'),
              delete: name => responseHeaders.append('set-cookie', name + '=; Max-Age=0; Secure; HttpOnly; SameSite=Lax; Path=/')
            },
            // SvelteKit server fetch constructs a Request before sending it.
            // Using the workerd constructor catches unsupported RequestInit values.
            fetch: (input, init) => {
              const outgoing = new Request(input, init);
              if (outgoing.redirect !== 'manual') throw new Error('OAuth requests must never follow redirects');
              outgoing.headers.set('origin', env.APP_ORIGIN);
              return fetch(outgoing);
            }
          };
          try {
            if (url.pathname === '/auth/github') await startGitHubLogin(event);
            else await completeGitHubLogin(event);
            return new Response('Unexpected auth completion', { status: 500 });
          } catch (error) {
            if (error.location) responseHeaders.set('location', error.location);
            return new Response(error.location ? null : error.body?.message || 'Auth failed', {
              status: error.status || 500, headers: responseHeaders
            });
          }
        }
      };
    `,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    sourcefile: 'worker-auth-entry.js'
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  logLevel: 'silent'
});

let scenario = 'success';
let requests = [];
const worker = new Miniflare({
  modules: true,
  script: bundle.outputFiles[0].text,
  compatibilityDate: '2026-05-10',
  compatibilityFlags: ['nodejs_compat'],
  host: '127.0.0.1', port: 0,
  d1Databases: { DB: 'test-auth-db' }, d1Persist: false,
  bindings: { APP_ORIGIN: origin, GITHUB_CLIENT_ID: 'fixture-id', GITHUB_CLIENT_SECRET: 'fixture-secret' },
  outboundService: async request => {
    requests.push({ url: request.url });
    if (request.url === 'https://github.com/login/oauth/access_token') {
      assert.equal(request.method, 'POST');
      const body = new URLSearchParams(await request.text());
      assert.equal(body.get('client_secret'), 'fixture-secret');
      assert.match(body.get('code_verifier'), /^[A-Za-z0-9_-]{43}$/);
      if (scenario === 'token_redirect') {
        return new Response(null, { status: 302, headers: { location: 'https://unexpected.example/token' } });
      }
      return Response.json({ access_token: 'fixture-access-token', token_type: 'bearer' });
    }
    if (request.url === 'https://api.github.com/user') {
      assert.equal(request.headers.get('authorization'), 'Bearer fixture-access-token');
      if (scenario === 'profile_redirect') {
        return new Response(null, { status: 307, headers: { location: 'https://unexpected.example/profile' } });
      }
      return Response.json({ id: 42, login: 'fixture-maker', name: 'Fixture maker' });
    }
    throw new Error('Unexpected outbound request; external access is disabled.');
  }
});

async function signIn() {
  const start = await worker.dispatchFetch(`${origin}/auth/github?returnTo=%2Fp%2Fapollo%2Fedit`, { redirect: 'manual' });
  assert.equal(start.status, 303);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const cookie = start.headers.getSetCookie().find(value => value.startsWith('__Host-triples_oauth=')).split(';')[0];
  return worker.dispatchFetch(`${origin}/auth/github/callback?state=${state}&code=fixture-code`, {
    redirect: 'manual', headers: { cookie }
  });
}

try {
  const db = await worker.getD1Database('DB');
  const migration = await readFile(new URL('../migrations/0001_claim.sql', import.meta.url), 'utf8');
  await db.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));

  const success = await signIn();
  assert.equal(success.status, 303, `Actual workerd must accept the OAuth request options; observed requests: ${JSON.stringify(requests)}`);
  assert.equal(success.headers.get('location'), '/p/apollo/edit');
  assert.ok(success.headers.getSetCookie().some(value => value.startsWith('__Host-triples_session=')));
  assert.equal(requests.length, 2);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM sessions').first()).count, 1);
  console.log('PASS real workerd OAuth callback completes with mocked GitHub and creates a session');

  for (const redirectScenario of ['token_redirect', 'profile_redirect']) {
    scenario = redirectScenario;
    requests = [];
    const failure = await signIn();
    assert.equal(failure.status, 502);
    assert.equal(requests.length, scenario === 'token_redirect' ? 1 : 2);
    assert.ok(requests.every(request => !request.url.startsWith('https://unexpected.example/')));
    assert.ok(!failure.headers.getSetCookie().some(value => value.startsWith('__Host-triples_session=')));
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM sessions').first()).count, 1);
    console.log(`PASS ${scenario} is rejected without following it or issuing a session`);
  }
  console.log('workerd OAuth integration: 3 checks passed; GitHub responses were local fixtures.');
} finally {
  await worker.dispose();
}
