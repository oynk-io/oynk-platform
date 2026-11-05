import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineAllowanceMaximumKobo, offlineAllowanceMinimumKobo } from './quickPay.js';

test('offline allowance exposes the initial configurable product range', () => {
  assert.equal(offlineAllowanceMinimumKobo, 10_000n);
  assert.equal(offlineAllowanceMaximumKobo, 2_000_000n);
});
