import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeHandle } from './handles.js';

test('Oynk handles normalize case and reject unsafe or reserved values', () => {
  assert.equal(normalizeHandle('  Shola_01 '), 'shola_01');
  for (const value of ['ab', '_shola', 'shola-', 'shola person', 'support', 'oynk']) {
    assert.throws(() => normalizeHandle(value));
  }
});
