// Build first: npm run build. This runs the built SvelteKit Worker and its real
// HTTP routes, forms, auth/session code, proof verifier and D1 queries. Only the
// external GitHub / DNS / project websites are replaced with local fixtures.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { parse } from 'parse5';

const origin = 'https://triples.love';
const projectUrls = {
  'flow-dns': 'https://dns-fixture.example.com/app/',
  'flow-html': 'https://html-fixture.example.com/app/'
};
const movedUrl = 'https://moved-fixture.example.com/new/';
const hosts = new Set([...Object.values(projectUrls), movedUrl].map(url => new URL(url).hostname));
const dnsProofs = new Map();
const htmlProofs = new Map();
const outboundCounts = { token: 0, profile: 0, A: 0, AAAA: 0, TXT: 0, html: 0 };
const unexpectedOutbound = [];
let expectedPkce;

console.log('Bundling the actual SvelteKit Worker for an isolated HTTP flow test...');
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../.svelte-kit/cloudflare/_worker.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'neutral',
  external: ['cloudflare:*', 'node:*'], logLevel: 'silent'
});

const worker = new Miniflare({
  modules: [{ type: 'ESModule', path: 'flow-worker.mjs', contents: bundle.outputFiles[0].text }],
  compatibilityDate: '2026-05-10', compatibilityFlags: ['nodejs_compat'],
  host: '127.0.0.1', port: 0,
  d1Databases: { DB: 'test-http-flow-db' }, d1Persist: false,
  bindings: { APP_ORIGIN: origin, GITHUB_CLIENT_ID: 'flow-fixture-id', GITHUB_CLIENT_SECRET: 'flow-fixture-secret' },
  serviceBindings: { ASSETS: () => new Response('Assets are not needed for HTTP form tests', { status: 404 }) },
  outboundService: async request => {
    const url = new URL(request.url);
    if (url.href === 'https://github.com/login/oauth/access_token') {
      outboundCounts.token++;
      assert.equal(request.method, 'POST');
      const form = new URLSearchParams(await request.text());
      assert.equal(form.get('client_id'), 'flow-fixture-id');
      assert.equal(form.get('client_secret'), 'flow-fixture-secret');
      assert.equal(form.get('redirect_uri'), `${origin}/auth/github/callback`);
      const pkce = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(form.get('code_verifier')))).toString('base64url');
      assert.equal(pkce, expectedPkce);
      return Response.json({ access_token: 'flow-fixture-token', token_type: 'bearer' });
    }
    if (url.href === 'https://api.github.com/user') {
      outboundCounts.profile++;
      assert.equal(request.headers.get('authorization'), 'Bearer flow-fixture-token');
      return Response.json({ id: 4242, login: 'flow-maker', name: 'Flow Maker' });
    }
    if (url.origin === 'https://cloudflare-dns.com' && url.pathname === '/dns-query') {
      const name = url.searchParams.get('name');
      const type = url.searchParams.get('type');
      const hostname = name?.startsWith('_triples-love.') ? name.slice('_triples-love.'.length) : name;
      assert.ok(hosts.has(hostname), 'Only fixture hostnames may be resolved');
      assert.ok(['A', 'AAAA', 'TXT'].includes(type));
      outboundCounts[type]++;
      const answer = type === 'A' ? [{ name, type: 1, TTL: 60, data: '93.184.216.34' }]
        : type === 'TXT' && dnsProofs.has(name) ? [{ name, type: 16, TTL: 60, data: JSON.stringify(`triples-love-verification=${dnsProofs.get(name)}`) }]
          : [];
      return Response.json({ Status: 0, Answer: answer });
    }
    if (htmlProofs.has(url.href)) {
      outboundCounts.html++;
      assert.equal(request.method, 'GET');
      assert.equal(request.headers.get('authorization'), null);
      assert.equal(request.headers.get('cookie'), null);
      const token = htmlProofs.get(url.href);
      return new Response(`<!doctype html><html><head><meta name="triples-love-verification" content="${token}"></head><body>Fixture project</body></html>`, {
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }
    unexpectedOutbound.push(`${url.origin}${url.pathname}`);
    throw new Error('Unexpected outbound request; real network access is disabled.');
  }
});

const cookies = new Map();
let httpRequests = 0;
async function request(path, form) {
  httpRequests++;
  assert.ok(httpRequests <= 40, 'Bound the HTTP flow instead of retrying indefinitely');
  const url = new URL(path, origin);
  assert.equal(url.origin, origin, 'Never dispatch a browser request outside the fixture app');
  const headers = new Headers({ accept: 'text/html', 'cf-connecting-ip': '93.184.216.34' });
  if (cookies.size) headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
  if (form) {
    headers.set('origin', origin);
    headers.set('content-type', 'application/x-www-form-urlencoded');
  }
  const response = await worker.dispatchFetch(url.href, {
    method: form ? 'POST' : 'GET', redirect: 'manual', headers,
    ...(form ? { body: form.toString() } : {})
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair, ...attributes] = cookie.split(';');
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (attributes.some(attribute => attribute.trim().toLowerCase() === 'max-age=0')) cookies.delete(name);
    else cookies.set(name, value);
  }
  return { status: response.status, headers: response.headers, html: await response.text() };
}

function attributes(node) { return Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value])); }
function elements(node, predicate) {
  const found = predicate(node) ? [node] : [];
  for (const child of node.childNodes || []) found.push(...elements(child, predicate));
  return found;
}
function nodeText(node) {
  if (['script', 'style', 'template'].includes(node.tagName)) return '';
  if (node.nodeName === '#text') return node.value;
  return (node.childNodes || []).map(nodeText).join(' ');
}
function findForm(html, matches) {
  const document = parse(html);
  const form = elements(document, node => node.tagName === 'form' && matches(attributes(node)))[0];
  assert.ok(form, 'Expected form exists in actual rendered HTML');
  const values = new URLSearchParams();
  for (const control of elements(form, node => ['input', 'textarea', 'select'].includes(node.tagName))) {
    const attrs = attributes(control);
    if (!attrs.name || Object.hasOwn(attrs, 'disabled')) continue;
    if (control.tagName === 'input') {
      if (['radio', 'checkbox'].includes(attrs.type) && !Object.hasOwn(attrs, 'checked')) continue;
      values.set(attrs.name, attrs.value || '');
    } else if (control.tagName === 'textarea') values.set(attrs.name, nodeText(control));
    else {
      const options = elements(control, node => node.tagName === 'option');
      const selected = options.find(option => Object.hasOwn(attributes(option), 'selected')) || options[0];
      values.set(attrs.name, attributes(selected).value ?? nodeText(selected));
    }
  }
  return { action: attributes(form).action || '', values };
}
function assertPage(response, expected, label) {
  assert.equal(response.status, 200, `${label}: expected successful HTML response`);
  // Collapse whitespace like a browser does; nodeText pads every element boundary.
  const text = nodeText(parse(response.html)).replace(/\s+/g, ' ');
  for (const value of expected) assert.ok(text.includes(value), `${label}: expected visible text ${value}`);
}

let db;
async function claim(id, method, targetUrl) {
  const path = `/p/${id}/claim/?lang=ko`;
  const page = await request(path);
  assertPage(page, ['flow-maker'], `${method} claim page`);
  const start = findForm(page.html, attrs => attrs.action?.startsWith('?/start'));
  start.values.set('method', method);
  if (targetUrl) start.values.set('targetUrl', targetUrl);
  const challengePage = await request(new URL(start.action, `${origin}${path}`).href, start.values);
  assert.equal(challengePage.status, 200, `${method} challenge generation succeeds`);
  const proof = findForm(challengePage.html, attrs => attrs.action?.startsWith('?/verify'));
  assert.ok(proof.values.get('challengeId'));
  const token = proof.values.get('token');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const finalUrl = targetUrl || projectUrls[id];
  if (method === 'dns') dnsProofs.set(`_triples-love.${new URL(finalUrl).hostname}`, token);
  else htmlProofs.set(finalUrl, token);
  const verified = await request(new URL(proof.action, `${origin}${path}`).href, proof.values);
  assert.equal(verified.status, 303, `${method} proof is accepted by the real verifier`);
  assert.equal(verified.headers.get('location'), `/p/${id}/edit/?claimed=1&lang=ko`);
  const ownership = await db.prepare('SELECT * FROM project_owners WHERE project_id=?').bind(id).first();
  assert.equal(ownership.verification_method, method);
  assert.equal(ownership.verified_url, finalUrl);
  const stored = await db.prepare('SELECT consumed_at, token_hash FROM verification_challenges WHERE id=?').bind(proof.values.get('challengeId')).first();
  assert.ok(stored.consumed_at);
  assert.notEqual(stored.token_hash, token);
  return request(verified.headers.get('location'));
}

async function edit(id, page, revision) {
  assertPage(page, ['flow-maker'], 'Edit page');
  const editor = findForm(page.html, attrs => (attrs.class || '').split(' ').includes('editor-form'));
  const previousVersion = Number(editor.values.get('version'));
  assert.ok(Number.isSafeInteger(previousVersion));
  const name = `${id} edited ${revision}`;
  const en = `${id} English introduction ${revision}`;
  const ko = `${id} 한국어 소개 ${revision}`;
  const descriptionEn = `${id} English full description ${revision}`;
  const descriptionKo = `${id} 한국어 상세 설명 ${revision}`;
  for (const [key, value] of Object.entries({
    name, category: 'tools', accent: 'violet', theme: 'light',
    tagline_en: en, description_en: descriptionEn, badges_en: 'catalog, tools',
    tagline_ko: ko, description_ko: descriptionKo, badges_ko: '도감, 도구',
    aliases: `${id} search alias`, links: 'Guide | https://fixture.example.com/guide/'
  })) editor.values.set(key, value);
  const saved = await request(new URL(editor.action, `${origin}/p/${id}/edit/`).href, editor.values);
  assert.equal(saved.status, 200, 'Native SvelteKit edit action succeeds');
  const nextEditor = findForm(saved.html, attrs => (attrs.class || '').split(' ').includes('editor-form'));
  assert.equal(Number(nextEditor.values.get('version')), previousVersion + 1);
  assert.equal((await db.prepare('SELECT version FROM projects WHERE id=?').bind(id).first()).version, previousVersion + 1);
  assertPage(await request(`/p/${id}/?lang=en`), [name, en, descriptionEn, 'Ownership verified', 'Verified by @flow-maker'], 'English public detail');
  assertPage(await request(`/p/${id}/?lang=ko`), [name, ko, descriptionKo, '소유권 인증됨', '@flow-maker 님이 사이트 소유권을 인증했습니다'], 'Korean public detail');
  assertPage(await request('/ko/'), [name, ko, '소유권 인증됨', '@flow-maker'], 'Korean directory');
  return saved;
}

try {
  db = await worker.getD1Database('DB');
  const migrationDirectory = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(migrationDirectory)).filter(name => name.endsWith('.sql')).sort()) {
    const migration = await readFile(new URL(name, migrationDirectory), 'utf8');
    const sql = migration.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
    await db.batch(sql.split(';').map(statement => statement.trim()).filter(Boolean).map(statement => db.prepare(statement)));
  }
  const seeds = [];
  for (const [id, url] of Object.entries(projectUrls)) {
    seeds.push(db.prepare(`INSERT INTO projects (id,name,url,domain,category,added_at,updated_at)
      VALUES (?,?,?,?,'tools','2026-10-10',?)`).bind(id, id, url, new URL(url).hostname, Date.now()));
    for (const lang of ['en', 'ko']) seeds.push(db.prepare(`INSERT INTO project_translations
      (project_id,lang,tagline,description,badges_json) VALUES (?,?,?,?,'[]')`).bind(id, lang, `Original ${lang}`, `Original description ${lang}`));
  }
  await db.batch(seeds);
  console.log('PASS actual migration applied; two projects seeded with no owner/session');

  const returnTo = '/p/flow-dns/claim/?lang=ko';
  const login = await request(`/auth/github?${new URLSearchParams({ returnTo })}`);
  assert.equal(login.status, 303);
  const authorization = new URL(login.headers.get('location'));
  assert.equal(authorization.origin + authorization.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(authorization.searchParams.get('scope'), '');
  expectedPkce = authorization.searchParams.get('code_challenge');
  const callback = await request(`/auth/github/callback?${new URLSearchParams({ state: authorization.searchParams.get('state'), code: 'flow-fixture-code' })}`);
  assert.equal(callback.status, 303, 'Real SvelteKit OAuth callback succeeds in workerd');
  assert.equal(callback.headers.get('location'), returnTo);
  assert.ok(cookies.has('__Host-triples_session'));
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM sessions').first()).count, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM oauth_states').first()).count, 0);
  console.log('PASS real OAuth HTTP routes establish a D1 session using mocked GitHub responses');

  await edit('flow-dns', await claim('flow-dns', 'dns'), 1);
  console.log('PASS DNS TXT claim -> edit -> D1 save -> public English/Korean detail and Korean directory');
  await edit('flow-html', await claim('flow-html', 'meta'), 1);
  console.log('PASS HTML meta claim -> edit -> D1 save -> public English/Korean detail and Korean directory');

  const movedEditor = await claim('flow-dns', 'meta', movedUrl);
  assert.equal((await db.prepare('SELECT url FROM projects WHERE id=?').bind('flow-dns').first()).url, movedUrl);
  await edit('flow-dns', movedEditor, 2);
  assert.equal((await db.prepare('SELECT version FROM projects WHERE id=?').bind('flow-dns').first()).version, 4);
  console.log('PASS owner URL re-verification -> verified URL update -> second versioned page save');

  const sessionBeforeLogout = cookies.get('__Host-triples_session');
  const logout = await request('/auth/logout', new URLSearchParams());
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.get('location'), '/');
  assert.ok(!cookies.has('__Host-triples_session'));
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM sessions').first()).count, 0);
  // Reusing the old browser cookie must not recover the revoked DB session.
  cookies.set('__Host-triples_session', sessionBeforeLogout);
  const afterLogout = await request('/p/flow-dns/edit/?lang=ko');
  assert.equal(afterLogout.status, 303);
  assert.ok(afterLogout.headers.get('location').startsWith('/auth/github?'));
  assert.ok(!cookies.has('__Host-triples_session'));
  console.log('PASS logout deletes D1 session; replayed old cookie cannot reopen editor');

  assert.equal(outboundCounts.token, 1);
  assert.equal(outboundCounts.profile, 1);
  assert.ok(outboundCounts.A >= 3 && outboundCounts.AAAA >= 3);
  assert.equal(outboundCounts.TXT, 1);
  assert.equal(outboundCounts.html, 2);
  assert.deepEqual(unexpectedOutbound, []);
  console.log(`Actual SvelteKit Worker HTTP flow passed (${httpRequests} requests). GitHub, DNS and project HTML were local fixtures; no real OAuth consent or production database was used.`);
} finally {
  await worker.dispose();
}
