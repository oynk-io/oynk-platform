import assert from 'node:assert/strict';
import test from 'node:test';
import { generateReferralCode, normalizeReferralCode, referralCodeHash } from './referrals.js';

test('referral codes are human-safe, stable and case-insensitive', () => {
  const code = generateReferralCode(() => Buffer.from(Array.from({ length: 16 }, (_, index) => index)));
  assert.match(code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/);
  assert.equal(normalizeReferralCode(` ${code.toLowerCase()} `), code);
  assert.equal(referralCodeHash(code.toLowerCase()), referralCodeHash(code));
  assert.throws(() => normalizeReferralCode('O0IL-invalid'));
});
