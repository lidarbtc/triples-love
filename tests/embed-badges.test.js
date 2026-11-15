import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFragment } from 'parse5';
import { badgeTypes, createBadgeEmbed, badgePageHref } from '../src/lib/embed-badges.js';
import { sites } from '../src/lib/data.js';

for (const type of ['listed', 'discover']) {
  for (const theme of ['light', 'dark']) {
    test(`${type} ${theme} embeds link the image to the correct public destination`, () => {
      const embed = createBadgeEmbed({ type, theme, projectId: 'wav-archive', lang: 'ko' });
      const href = type === 'listed'
        ? 'https://triples.love/p/wav-archive/?lang=ko&utm_source=badge'
        : 'https://triples.love/?utm_source=badge';
      assert.equal(embed.href, href);
      assert.equal(embed.src, `https://triples.love/badges/${type}-${theme}.svg`);
      assert.equal(embed.width, type === 'listed' ? 216 : 240);
      assert.equal(embed.height, type === 'listed' ? 32 : 44);
      assert.equal(embed.alt, type === 'listed' ? 'Listed on triples.love' : 'Discover more fan projects on triples.love');
      assert.equal(embed.markdown, `[![${embed.alt}](${embed.src})](${href})`);

      const fragment = parseFragment(embed.html);
      assert.equal(fragment.childNodes.length, 1);
      const anchor = fragment.childNodes[0];
      assert.equal(anchor.tagName, 'a');
      assert.deepEqual(Object.fromEntries(anchor.attrs.map(({ name, value }) => [name, value])), {
        href, target: '_blank', rel: 'noopener'
      });
      const children = anchor.childNodes.filter(node => node.tagName);
      assert.equal(children.length, 1);
      assert.equal(children[0].tagName, 'img');
      assert.deepEqual(Object.fromEntries(children[0].attrs.map(({ name, value }) => [name, value])), {
        src: embed.src, alt: embed.alt, width: String(embed.width), height: String(embed.height),
        loading: 'lazy', decoding: 'async', style: 'display:block;max-width:100%;height:auto;border:0'
      });
      if (type === 'listed') assert.ok(embed.html.includes('?lang=ko&amp;utm_source=badge'));
    });
  }
}

test('defaults preserve automatic homepage language and normalize detail language', () => {
  assert.equal(createBadgeEmbed().href, 'https://triples.love/?utm_source=badge');
  assert.equal(createBadgeEmbed().src, 'https://triples.love/badges/discover-light.svg');
  assert.equal(createBadgeEmbed({ type: 'listed', projectId: 'apollo', lang: 'unsupported' }).href,
    'https://triples.love/p/apollo/?lang=en&utm_source=badge');
  assert.equal(badgeTypes.discover.label, 'Discover more fan projects');
});

test('unknown badge variants and unsafe project IDs cannot enter embed markup', () => {
  for (const type of ['verified', '__proto__', '', null]) assert.throws(() => createBadgeEmbed({ type }));
  for (const theme of ['auto', '../light', '', null]) assert.throws(() => createBadgeEmbed({ theme }));
  assert.throws(() => createBadgeEmbed({ type: 'listed' }));
  for (const projectId of ['/', '.', '..', '../apollo', 'a/b', 'a\\b', 'a\nb', 'a%2fb', 'a" onclick="alert(1)', 'Apollo', '-apollo', 'apollo-', 'a--b', 'a'.repeat(129), null, 1]) {
    assert.throws(() => createBadgeEmbed({ type: 'listed', projectId }), String(projectId));
    assert.throws(() => badgePageHref(projectId), String(projectId));
  }
});

test('chooser links preserve supported language and accept every existing project ID', () => {
  assert.equal(badgePageHref(), '/badges/?lang=en');
  assert.equal(badgePageHref('', 'ko'), '/badges/?lang=ko');
  assert.equal(badgePageHref('apollo', 'ko'), '/badges/?project=apollo&lang=ko');
  assert.equal(badgePageHref('apollo', 'unsupported'), '/badges/?project=apollo&lang=en');
  for (const site of sites) assert.doesNotThrow(() => createBadgeEmbed({ type: 'listed', projectId: site.id }));
});
