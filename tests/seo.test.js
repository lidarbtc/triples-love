import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSitemap, jsonLdScript, projectMeta, projectUrl, truncate } from '../src/lib/seo.js';

const project = { id: 'hayeonarchive', name: 'Hayeon Archive', url: 'https://hayeonarchive.com/', updatedAt: Date.UTC(2026, 10, 1) };

test('each language of a project page has its own canonical URL', () => {
  assert.equal(projectUrl('hayeonarchive', 'en'), 'https://triples.love/p/hayeonarchive/');
  assert.equal(projectUrl('hayeonarchive', 'ko'), 'https://triples.love/p/hayeonarchive/?lang=ko');
});

test('project titles carry the tagline and snippets use the full description', () => {
  const meta = projectMeta(project, { tagline: '정하연 팬 아카이브', description: 'tripleS 정하연의 사진과 영상을 모아둔 팬 아카이브입니다.' }, 'ko');
  assert.equal(meta.title, 'Hayeon Archive – 정하연 팬 아카이브 | triples.love');
  assert.equal(meta.description, 'tripleS 정하연의 사진과 영상을 모아둔 팬 아카이브입니다.');
  assert.equal(meta.canonical, 'https://triples.love/p/hayeonarchive/?lang=ko');
});

test('an overlong tagline stays out of the title and long descriptions are cut at a word', () => {
  const long = 'An interactive tripleS fan archive integrating member profiles, Dimensions, and Objekt collections';
  assert.equal(projectMeta(project, { tagline: long, description: '' }, 'en').title, 'Hayeon Archive | triples.love');
  const cut = truncate('word '.repeat(60));
  assert.ok(cut.length <= 160 && cut.endsWith('word…'));
});

test('structured data cannot close its script tag', () => {
  assert.ok(!jsonLdScript({ name: '</script><b>' }).includes('</script><b>'));
});

test('sitemap lists both languages with alternates, dates, and screenshots', () => {
  const xml = buildSitemap([project]);
  assert.ok(xml.includes('<loc>https://triples.love/p/hayeonarchive/</loc>'));
  assert.ok(xml.includes('<loc>https://triples.love/p/hayeonarchive/?lang=ko</loc>'));
  assert.ok(xml.includes('hreflang="ko" href="https://triples.love/p/hayeonarchive/?lang=ko"'));
  assert.ok(xml.includes('<lastmod>2026-11-01</lastmod>'));
  assert.ok(xml.includes('<image:loc>https://triples.love/site-screenshots/hayeonarchive.jpg</image:loc>'));
  assert.ok(xml.includes('<loc>https://triples.love/ko/</loc>'));
});
