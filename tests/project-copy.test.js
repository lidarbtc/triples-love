import test from 'node:test';
import assert from 'node:assert/strict';
import { TAGLINE_DISPLAY_MAX, displayTagline, splitLastWord } from '../src/lib/project-copy.js';

test('verified seal stays on the line of the last word', () => {
  assert.deepEqual(splitLastWord('Objekts Trading Platform'), ['Objekts Trading ', 'Platform']);
  assert.deepEqual(splitLastWord('Apollo'), ['', 'Apollo']);
});

test('long short-descriptions are shortened for display and short ones left alone', () => {
  assert.equal(displayTagline('정하연 팬 아카이브'), '정하연 팬 아카이브');
  const long = 'An interactive tripleS fan archive integrating member profiles, Dimensions, Objekt collections, and SIGNAL videos';
  const shown = displayTagline(long);
  assert.ok(shown.length <= TAGLINE_DISPLAY_MAX && shown.endsWith('…'));
  assert.ok(long.startsWith(shown.slice(0, -1)));
});
