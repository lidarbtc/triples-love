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
let githubFailure;
let dnsFailure = false;
const runtimeLogs = [];
const privateValues = new Set(['flow-fixture-secret', 'flow-fixture-token', 'flow-fixture-code', 'PRIVATE_UPSTREAM_BODY']);
const expectedFailures = [];
function expectFailure(response, operation, code, level = 'error') {
  const id = response.headers.get('x-request-id');
  assert.ok(id, 'Application responses expose a correlation ID');
  expectedFailures.push({ id, operation, code, level });
}

console.log('Bundling the actual SvelteKit Worker for an isolated HTTP flow test...');
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../.svelte-kit/cloudflare/_worker.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'neutral',
  // workerd formats object console arguments with util.inspect for local stdio.
  // Serialize only our structured records for assertions; leave all other output
  // untouched so accidental raw error/credential logging is still detectable.
  banner: { js: `for (const level of ['info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => original(...(args.length === 1 && args[0]?.event
      ? [JSON.stringify(args[0])] : args));
  }` },
  external: ['cloudflare:*', 'node:*'], logLevel: 'silent'
});

const worker = new Miniflare({
  handleStructuredLogs: record => { runtimeLogs.push(record); },
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
      if (githubFailure === 'token_http') return new Response('PRIVATE_UPSTREAM_BODY', { status: 503 });
      if (githubFailure === 'bad_json') return new Response('PRIVATE_UPSTREAM_BODY');
      if (githubFailure === 'timeout') return new Promise(resolve => setTimeout(() => resolve(new Response('late')), 11_000));
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
      if (githubFailure === 'profile_http') return new Response('PRIVATE_UPSTREAM_BODY', { status: 503 });
      assert.equal(request.headers.get('authorization'), 'Bearer flow-fixture-token');
      return Response.json({ id: 4242, login: 'flow-maker', name: 'Flow Maker' });
    }
    if (url.origin === 'https://cloudflare-dns.com' && url.pathname === '/dns-query') {
      if (dnsFailure) return new Response('PRIVATE_UPSTREAM_BODY', { status: 503 });
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
  assert.ok(httpRequests <= 90, 'Bound the HTTP flow instead of retrying indefinitely');
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
    if (value) privateValues.add(value);
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
  privateValues.add(token);
  if (method === 'dns') {
    const notVerified = await request(new URL(proof.action, `${origin}${path}`).href, proof.values);
    assert.equal(notVerified.status, 400);
    expectFailure(notVerified, 'claim.verify', 'not_verified', 'info');
    await db.prepare('UPDATE verification_challenges SET last_checked_at=0').run();
    dnsFailure = true;
    const dnsFailed = await request(new URL(proof.action, `${origin}${path}`).href, proof.values);
    dnsFailure = false;
    assert.equal(dnsFailed.status, 400);
    expectFailure(dnsFailed, 'claim.verify', 'dns_failed');
    await db.prepare('UPDATE verification_challenges SET last_checked_at=0').run();
  }
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
  const stale = await request(new URL(editor.action, `${origin}/p/${id}/edit/`).href, editor.values);
  assert.equal(stale.status, 409);
  expectFailure(stale, 'project.edit', 'version_conflict', 'info');
  const invalid = new URLSearchParams(editor.values);
  invalid.set('name', '');
  const invalidEdit = await request(new URL(editor.action, `${origin}/p/${id}/edit/`).href, invalid);
  assert.equal(invalidEdit.status, 400);
  expectFailure(invalidEdit, 'project.edit', 'invalid_input', 'info');
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
  assert.equal(outboundCounts.TXT, 2);
  assert.equal(outboundCounts.html, 2);
  assert.deepEqual(unexpectedOutbound, []);
  for (const mode of ['token_http', 'profile_http', 'bad_json', 'timeout']) {
    const start = await request('/auth/github');
    const target = new URL(start.headers.get('location'));
    expectedPkce = target.searchParams.get('code_challenge');
    privateValues.add(target.searchParams.get('state'));
    githubFailure = mode;
    const failed = await request(`/auth/github/callback?${new URLSearchParams({ state: target.searchParams.get('state'), code: 'flow-fixture-code' })}`);
    githubFailure = undefined;
    assert.equal(failed.status, 502);
    expectFailure(failed, mode === 'profile_http' ? 'oauth.profile' : 'oauth.token_exchange',
      mode.endsWith('_http') ? 'upstream_http' : mode === 'bad_json' ? 'invalid_response' : 'timeout');
    assert.equal(cookies.has('__Host-triples_session'), false);
  }
  // Missing table exercises a real D1 failure during the initial session lookup,
  // before resolve(), and then the framework handleError path.
  await db.prepare('DROP TABLE sessions').run();
  cookies.set('__Host-triples_session', 'A'.repeat(43));
  privateValues.add('A'.repeat(43));
  const dbFailure = await request('/en/');
  assert.equal(dbFailure.status, 500);
  cookies.clear();
  const recovered = await request('/en/');
  assert.equal(recovered.status, 200);
  await db.prepare('DROP TABLE project_translations').run();
  const loadFailure = await request('/ko/');
  assert.equal(loadFailure.status, 500);
  expectFailure(loadFailure, 'project.read', 'db_failed');
  // Give workerd's log stream a bounded opportunity to drain.
  const deadline = Date.now() + 2000;
  let records;
  do {
    records = runtimeLogs.flatMap(log => {
      try { const parsed = JSON.parse(log.message); return parsed.request_id ? [{ level: log.level, ...parsed }] : []; }
      catch { return []; }
    });
    if (records.filter(log => log.event === 'request.complete').length >= httpRequests) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  assert.equal(records.filter(log => log.event === 'request.complete').length, httpRequests);
  for (const expected of expectedFailures) {
    const details = records.filter(log => log.request_id === expected.id && log.event === 'operation.result');
    assert.equal(details.length, 1, 'A handled failure has exactly one detailed record');
    assert.equal(details[0].operation, expected.operation);
    assert.equal(details[0].error_code, expected.code);
    assert.equal(details[0].level, expected.level);
    const summary = records.find(log => log.request_id === expected.id && log.event === 'request.complete');
    assert.equal(summary.outcome, 'failure');
  }
  const dbDetails = records.filter(log => log.error_code === 'db_failed');
  assert.equal(dbDetails.length, 2);
  assert.equal(dbDetails[0].operation, 'session.read');
  assert.equal(records.filter(log => log.request_id === dbDetails[0].request_id && log.event === 'operation.result').length, 1);
  assert.ok(records.some(log => log.operation === 'claim.verify' && log.method === 'dns' && log.outcome === 'success'));
  assert.ok(records.some(log => log.operation === 'claim.verify' && log.method === 'meta' && log.outcome === 'success'));
  const serialized = JSON.stringify(runtimeLogs);
  for (const secret of privateValues) assert.ok(!serialized.includes(secret), 'Runtime logs must not contain a fixture credential or proof');
  assert.ok(!serialized.includes('SELECT users.id'), 'D1 error SQL must not reach logs');
  assert.ok(!serialized.includes('no such table'), 'D1 raw errors must not reach logs');
  console.log(`PASS ${expectedFailures.length} handled failure cases, initial session D1 failure, request correlation, deduplication and secret exclusion`);
  console.log(`Actual SvelteKit Worker HTTP flow passed (${httpRequests} requests). GitHub, DNS and project HTML were local fixtures; no real OAuth consent or production database was used.`);
} finally {
  await worker.dispose();
}
