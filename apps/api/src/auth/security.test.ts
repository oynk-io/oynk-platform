import assert from "node:assert/strict";
import test from "node:test";

import { generateOtp, hashPassword, normalizeEmail, passwordPolicyError, secureHash, validateReturnTo, verifyPassword } from "./security.js";

test("password hashes are salted and verifiable", async () => {
  const first = await hashPassword("Long-Password-123");
  const second = await hashPassword("Long-Password-123");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("Long-Password-123", first), true);
  assert.equal(await verifyPassword("wrong", first), false);
});

test("OTP values have exactly six numeric digits and are hashable", () => {
  const code = generateOtp();
  assert.match(code, /^\d{6}$/);
  assert.equal(secureHash(code), secureHash(code));
});

test("return destinations reject open redirect forms", () => {
  assert.equal(validateReturnTo("/business/home"), "/business/home");
  assert.equal(validateReturnTo("//attacker.example"), null);
  assert.equal(validateReturnTo("/%2f%2fattacker.example"), null);
  assert.equal(validateReturnTo("https://attacker.example"), null);
  assert.equal(validateReturnTo("/\\attacker.example"), null);
});

test("email normalization and password policy are deterministic", () => {
  assert.equal(normalizeEmail(" Person@Example.COM "), "person@example.com");
  assert.equal(passwordPolicyError("short"), "Password must contain at least 12 characters.");
  assert.equal(passwordPolicyError("Long-Password-123"), null);
});
