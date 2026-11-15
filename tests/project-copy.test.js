import test from 'node:test';
import assert from 'node:assert/strict';
import { splitLastWord } from '../src/lib/project-copy.js';

test('verified seal stays on the line of the last word', () => {
  assert.deepEqual(splitLastWord('Objekts Trading Platform'), ['Objekts Trading ', 'Platform']);
  assert.deepEqual(splitLastWord('Apollo'), ['', 'Apollo']);
});
