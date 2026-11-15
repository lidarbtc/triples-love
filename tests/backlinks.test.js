import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestDb } from './helpers/d1.js';
import {
  FEATURED_GRACE_MS, RENDER_DAILY_LIMIT, budgetedRenderer, checkBacklink, findBacklinkInHtml,
  getBacklinkStatus, isBacklinkHref, isFeatured, listFeaturedIds, pickFeatured,
  recordBacklinkCheck, seoulDateKey
} from '../src/lib/server/backlinks.js';
import { runScheduledBacklinkChecks } from '../src/lib/server/backlink-cron.js';

const page = 'https://fans.example.com/app/';
const project = { id: 'fan-app', url: page };
const publicDns = async (_name, type) => type === 'A' ? ['93.184.216.34'] : [];
const html = body => new Response(`<!doctype html><html><head></head><body>${body}</body></html>`, {
  headers: { 'content-type': 'text/html; charset=utf-8' }
});
const banner = '<footer><a href="https://triples.love/p/fan-app/?lang=ko&utm_source=badge"><img src="x.svg"></a></footer>';

test('banner links must point to the directory or to the same project page', () => {
  for (const href of [
    'https://triples.love/', 'https://triples.love', 'https://triples.love/?utm_source=badge',
    'https://triples.love/ko/', 'https://www.triples.love/en', 'http://triples.love/p/fan-app',
    'https://triples.love/p/fan-app/?lang=en&utm_source=badge', ' https://triples.love/ '
  ]) assert.equal(isBacklinkHref(href, page, 'fan-app'), true, href);
  for (const href of [
    'https://triples.love/p/other-app/', 'https://triples.love/badges/', 'https://triples.love.evil.example/',
    'https://evil.example/triples.love/', 'https://triples.love:8443/', 'javascript:alert(1)', '/p/fan-app/',
    'mailto:hello@triples.love', '', null
  ]) assert.equal(isBacklinkHref(href, page, 'fan-app'), false, String(href));
});

test('only real anchors count, never text in comments, scripts, noscript or templates', () => {
  assert.equal(findBacklinkInHtml(`<body>${banner}</body>`, page, 'fan-app'), 'https://triples.love/p/fan-app/?lang=ko&utm_source=badge');
  assert.equal(findBacklinkInHtml('<A HREF="https://TRIPLES.LOVE/">x</A>', page, 'fan-app'), 'https://triples.love/');
  for (const markup of [
    '<!-- <a href="https://triples.love/">x</a> -->',
    '<script>document.write(\'<a href="https://triples.love/">x</a>\')</script>',
    '<noscript><a href="https://triples.love/">x</a></noscript>',
    '<template><a href="https://triples.love/">x</a></template>',
    '<p>https://triples.love/</p>', '<link rel="me" href="https://triples.love/">',
    '<a href="https://triples.love/p/other-app/">other</a>'
  ]) assert.equal(findBacklinkInHtml(markup, page, 'fan-app'), null, markup);
});

test('raw HTML is checked first, then a browser render only when the link is not in HTML', async () => {
  let renders = 0;
  const render = async () => { renders++; return { url: page, hrefs: ['https://triples.love/ko/'] }; };
  const found = await checkBacklink(project, { resolve: publicDns, fetcher: async () => html(banner), render });
  assert.deepEqual(found, { state: 'found', detectedBy: 'html', href: 'https://triples.love/p/fan-app/?lang=ko&utm_source=badge', rendered: false });
  assert.equal(renders, 0);

  const spa = await checkBacklink(project, { resolve: publicDns, fetcher: async () => html('<div id="app"></div>'), render });
  assert.deepEqual(spa, { state: 'found', detectedBy: 'rendered', href: 'https://triples.love/ko/', rendered: true });
  assert.equal(renders, 1);

  assert.deepEqual(await checkBacklink(project, { resolve: publicDns, fetcher: async () => html('<div id="app"></div>') }),
    { state: 'missing', code: 'not_found', rendered: false });
  assert.deepEqual(await checkBacklink(project, {
    resolve: publicDns, fetcher: async () => html(''), render: async () => ({ url: page, hrefs: ['https://elsewhere.example/'] })
  }), { state: 'missing', code: 'not_found', rendered: true });
});

test('failures do not count as a removed banner and private targets are never rendered', async () => {
  let renders = 0;
  const render = async () => { renders++; return { url: page, hrefs: [] }; };
  const privateDns = async (_name, type) => type === 'A' ? ['10.0.0.1'] : [];
  assert.deepEqual(await checkBacklink(project, { resolve: privateDns, fetcher: async () => html(banner), render }),
    { state: 'unreachable', code: 'private_target', rendered: false });
  assert.equal(renders, 0);
  assert.deepEqual(await checkBacklink({ id: 'fan-app', url: 'http://fans.example.com/' }, { render }),
    { state: 'unreachable', code: 'invalid_url', rendered: false });

  const blocked = async () => new Response('challenge', { status: 403 });
  assert.deepEqual(await checkBacklink(project, { resolve: publicDns, fetcher: blocked }),
    { state: 'unreachable', code: 'blocked', rendered: false });
  assert.deepEqual(await checkBacklink(project, { resolve: publicDns, fetcher: blocked, render: async () => ({ url: page, hrefs: [] }) }),
    { state: 'unreachable', code: 'blocked', rendered: true }, 'A challenge page without links is not a removed banner');
  assert.equal((await checkBacklink(project, {
    resolve: publicDns, fetcher: async () => new Response('down', { status: 500 })
  })).code, 'http_failed');
  assert.equal((await checkBacklink(project, {
    resolve: publicDns, fetcher: blocked, render: async () => ({ url: page, hrefs: ['https://triples.love/'] })
  })).detectedBy, 'rendered', 'A bot-challenged raw fetch can still be confirmed by a browser');

  assert.deepEqual(await checkBacklink(project, { resolve: publicDns, fetcher: async () => html(''), render: async () => { throw new Error('boom'); } }),
    { state: 'unreachable', code: 'render_failed', rendered: false });
  assert.deepEqual(await checkBacklink(project, {
    resolve: publicDns, fetcher: async () => html(''), render: async () => ({ url: 'https://other.example/', hrefs: ['https://triples.love/'] })
  }), { state: 'unreachable', code: 'redirect', rendered: true });
});

function backlinkDb(t) {
  const db = createTestDb();
  t.after(() => db.close());
  db.sqlite.exec(readFileSync('migrations/0004_project_backlinks.sql', 'utf8'));
  const insert = db.sqlite.prepare(`INSERT INTO projects (id,name,url,domain,category,added_at,updated_at,status)
    VALUES (?,?,?,?,'tools','2026-10-10',0,?)`);
  for (const [id, status] of [['fan-app', 'active'], ['spa-app', 'active'], ['old-app', 'archived'], ['manual-app', 'active']]) {
    insert.run(id, id, `https://${id}.example.com/`, `${id}.example.com`, status);
  }
  return db;
}

test('featured state survives outages and one miss, then ends after two misses or a week without the link', async t => {
  const db = backlinkDb(t);
  const day = 24 * 60 * 60 * 1000;
  const start = Date.UTC(2026, 10, 2);
  const found = { state: 'found', detectedBy: 'html', href: 'https://triples.love/' };
  let row = await recordBacklinkCheck(db, 'fan-app', found, start);
  assert.equal(row.first_found_at, start);
  assert.equal((await getBacklinkStatus(db, 'fan-app', start)).featured, true);

  row = await recordBacklinkCheck(db, 'fan-app', { state: 'unreachable', code: 'timeout' }, start + day);
  assert.equal(row.miss_count, 0);
  assert.equal(row.link_href, 'https://triples.love/');
  assert.equal(row.last_error, 'timeout');
  assert.equal(isFeatured({ ...row, status: 'active' }, start + day), true);
  assert.equal(isFeatured({ ...row, status: 'active' }, start + FEATURED_GRACE_MS + 1), false, 'An outage keeps the feature for at most a week');

  row = await recordBacklinkCheck(db, 'fan-app', { state: 'missing', code: 'not_found' }, start + day);
  assert.equal(row.miss_count, 1);
  assert.equal((await getBacklinkStatus(db, 'fan-app', start + day)).featured, true, 'One miss is tolerated');
  row = await recordBacklinkCheck(db, 'fan-app', { state: 'missing', code: 'not_found' }, start + 2 * day);
  assert.equal(row.miss_count, 2);
  assert.equal((await getBacklinkStatus(db, 'fan-app', start + 2 * day)).featured, false);

  row = await recordBacklinkCheck(db, 'fan-app', { ...found, detectedBy: 'rendered' }, start + 3 * day);
  assert.equal(row.miss_count, 0);
  assert.equal(row.first_found_at, start, 'The first discovery time is kept');
  assert.equal(row.detected_by, 'rendered');

  await recordBacklinkCheck(db, 'old-app', found, start);
  db.sqlite.exec(`INSERT INTO project_backlinks (project_id,state,detected_by,last_checked_at,override,override_note)
    VALUES ('manual-app','found','manual',0,'force_on','manual:test')`);
  await recordBacklinkCheck(db, 'spa-app', found, start + 3 * day);
  db.sqlite.exec("UPDATE project_backlinks SET override='force_off' WHERE project_id='spa-app'");
  assert.deepEqual((await listFeaturedIds(db, start + 3 * day)).sort(), ['fan-app', 'manual-app'],
    'Archived and force_off projects are excluded; force_on needs no link evidence');
});

test('featured rotation is stable for a Korean day, changes the next day and caps the slots', () => {
  const ids = Array.from({ length: 12 }, (_, index) => `project-${index}`);
  assert.equal(seoulDateKey(Date.UTC(2026, 10, 1, 14, 59)), '2026-11-01');
  assert.equal(seoulDateKey(Date.UTC(2026, 10, 1, 15, 0)), '2026-11-02');
  const today = pickFeatured(ids, '2026-11-02');
  assert.equal(today.length, 4);
  assert.deepEqual(pickFeatured([...ids].reverse(), '2026-11-02'), today, 'Input order does not matter');
  assert.notDeepEqual(pickFeatured(ids, '2026-11-03'), today);
  assert.deepEqual(pickFeatured(['a'], '2026-11-02'), ['a']);
});

test('the shared daily render budget stops browser rendering without failing the check', async t => {
  const db = backlinkDb(t);
  let renders = 0;
  const render = budgetedRenderer(db, async () => { renders++; return { url: page, hrefs: [] }; });
  for (let index = 0; index < RENDER_DAILY_LIMIT; index++) await render(page);
  await assert.rejects(render(page), { code: 'render_unavailable' });
  assert.equal(renders, RENDER_DAILY_LIMIT);
});

test('scheduled checks visit the oldest projects, skip overrides and re-render only rendered banners', async t => {
  const db = backlinkDb(t);
  await recordBacklinkCheck(db, 'spa-app', { state: 'found', detectedBy: 'rendered', href: 'https://triples.love/' }, 1);
  db.sqlite.exec(`INSERT INTO project_backlinks (project_id,state,detected_by,last_checked_at,override)
    VALUES ('manual-app','found','manual',0,'force_on')`);
  const fetched = [];
  const rendered = [];
  const summary = await runScheduledBacklinkChecks({ DB: db, BROWSER: {} }, {
    resolve: publicDns,
    fetcher: async url => { fetched.push(new URL(url).hostname); return html(url.includes('fan-app') ? '<a href="https://triples.love/">x</a>' : ''); },
    renderer: async (_binding, url) => { rendered.push(new URL(url).hostname); return { url, hrefs: ['https://triples.love/en/'] }; },
    now: () => 10
  });
  assert.deepEqual(summary, { checked: 2, found: 2, missing: 0, unreachable: 0, rendered: 1 });
  assert.deepEqual(fetched.sort(), ['fan-app.example.com', 'spa-app.example.com']);
  assert.deepEqual(rendered, ['spa-app.example.com']);
  assert.equal((await getBacklinkStatus(db, 'manual-app', 10)).lastCheckedAt, 0, 'Overridden projects are not checked');
});

