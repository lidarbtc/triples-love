import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestDb } from './helpers/d1.js';
import { getProject, listProjects, saveProject, validateProjectForm } from '../src/lib/server/projects.js';
import { sites } from '../src/lib/data.js';

function fixture(t) {
  const db = createTestDb();
  t.after(() => db.close());
  // Exercise the generated import, including Korean copy and archived records.
  db.sqlite.exec(readFileSync('.wrangler/seed-projects.sql', 'utf8'));
  db.sqlite.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('owner', '42', 'maker', 'Maker', '', Date.now());
  db.sqlite.prepare('INSERT INTO project_owners VALUES (?,?,?,?,?,?)').run('apollo', 'owner', Date.now(), 'meta', 'https://apollo.cafe/objekts', 'test-proof');
  return db;
}

function form(overrides = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    name: 'Apollo revised', category: 'objekts', accent: 'violet', theme: 'dark',
    tagline_en: 'A new tagline', description_en: 'A new description', badges_en: 'catalog, stats',
    tagline_ko: '새 소개', description_ko: '새 프로젝트 설명', badges_ko: '도감, 통계',
    aliases: '찾기, searchable-alias', links: 'Guide | https://apollo.cafe/guide', version: '0',
    ...overrides
  })) data.set(key, value);
  return data;
}

test('database import preserves every listing, bilingual copy, aliases and archive state', async t => {
  const db = fixture(t);
  const projects = await listProjects(db);
  assert.equal(projects.length, sites.length);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM project_translations').get().n, sites.length * 2);
  for (const project of projects) {
    assert.ok(project.locales.en.description);
    assert.ok(project.locales.ko.description);
  }
  assert.equal(projects.find(p => p.id === 'wavbase').status, 'archived');
  assert.ok(projects.find(p => p.id === 'wav-archive').aliases.includes('입덕 가이드'));
  assert.equal(projects.find(p => p.id === 'apollo').owner.handle, 'maker');
});

test('owner edits both locales and search aliases in one save without changing the verified URL', async t => {
  const db = fixture(t);
  await saveProject(db, 'apollo', 'owner', validateProjectForm(form({ url: 'https://unverified.example.org/' })));
  const project = await getProject(db, 'apollo');
  assert.equal(project.version, 1);
  assert.equal(project.name, 'Apollo revised');
  assert.equal(project.locales.en.tagline, 'A new tagline');
  assert.equal(project.locales.ko.tagline, '새 소개');
  assert.deepEqual(project.aliases, ['찾기', 'searchable-alias']);
  assert.equal(project.url, 'https://apollo.cafe/objekts');
  assert.equal(project.links[0].url, 'https://apollo.cafe/guide');
});

test('stale editor cannot partially overwrite a newer save or its translations', async t => {
  const db = fixture(t);
  await saveProject(db, 'apollo', 'owner', validateProjectForm(form()));
  await assert.rejects(() => saveProject(db, 'apollo', 'owner', validateProjectForm(form({ tagline_en: 'Stale value', tagline_ko: '오래된 값' }))), e => e.status === 409);
  const project = await getProject(db, 'apollo');
  assert.equal(project.locales.en.tagline, 'A new tagline');
  assert.equal(project.locales.ko.tagline, '새 소개');
  assert.equal(project.version, 1);
});

test('another account cannot edit the project even with the current version', async t => {
  const db = fixture(t);
  const before = await getProject(db, 'apollo');
  await assert.rejects(() => saveProject(db, 'apollo', 'stranger', validateProjectForm(form())), e => e.status === 409);
  assert.deepEqual(await getProject(db, 'apollo'), before);
});

test('archived listings remain read-only', async t => {
  const db = fixture(t);
  db.sqlite.exec("UPDATE projects SET status='archived' WHERE id='apollo'");
  await assert.rejects(() => saveProject(db, 'apollo', 'owner', validateProjectForm(form())), e => e.status === 409);
});

test('seeding again never overwrites saved owner content', async t => {
  const db = fixture(t);
  await saveProject(db, 'apollo', 'owner', validateProjectForm(form()));
  db.sqlite.exec(readFileSync('.wrangler/seed-projects.sql', 'utf8'));
  const project = await getProject(db, 'apollo');
  assert.equal(project.name, 'Apollo revised');
  assert.equal(project.locales.ko.description, '새 프로젝트 설명');
  assert.equal(project.version, 1);
});

test('light default migration preserves themes already chosen by owners', async t => {
  const db = fixture(t);
  db.sqlite.exec("UPDATE projects SET theme='auto' WHERE id IN ('apollo','comets')");
  db.sqlite.exec(readFileSync(new URL('../migrations/0002_unclaimed_light_theme.sql', import.meta.url), 'utf8'));
  assert.equal((await getProject(db, 'apollo')).theme, 'auto');
  assert.equal((await getProject(db, 'comets')).theme, 'light');
  assert.equal((await getProject(db, 'apollo')).owner.id, 'owner');
});

test('invalid links, enum values, lengths and versions cannot enter the database', () => {
  for (const overrides of [
    { links: 'Code | javascript:alert(1)' }, { links: 'Site | https://user:password@example.org' },
    { links: 'Site | http://example.org' }, { name: '' }, { name: 'x'.repeat(81) },
    { theme: 'custom-css' }, { category: 'all' }, { accent: 'url(javascript:alert(1))' },
    { version: '-1' }, { version: '9007199254740999' }, { tagline_en: '' }
  ]) assert.throws(() => validateProjectForm(form(overrides)));
  const optional = validateProjectForm(form({ tagline_ko: '', description_ko: '', badges_ko: '' }));
  assert.equal(optional.locales.ko.description, '');
});
