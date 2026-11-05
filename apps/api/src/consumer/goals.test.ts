import assert from 'node:assert/strict';
import test from 'node:test';
import { goalInputSchema } from './goals.js';

test('goal input requires useful bounded planning details', () => {
  const future = new Date(); future.setUTCMonth(future.getUTCMonth() + 6);
  const targetDate = future.toISOString().slice(0, 10);
  assert.equal(goalInputSchema.safeParse({ category: 'car', profession: 'Designer', targetAmountNaira: '12000000', targetDate }).success, true);
  assert.equal(goalInputSchema.safeParse({ category: 'other', profession: 'Designer', targetAmountNaira: '12000000', targetDate }).success, false);
  assert.equal(goalInputSchema.safeParse({ category: 'other', customGoal: 'School fees', profession: 'Designer', targetAmountNaira: '9999', targetDate }).success, false);
});
