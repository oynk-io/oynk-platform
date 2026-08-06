import assert from "node:assert/strict";
import test from "node:test";
import { otpEmail } from "./templates.js";

test("OTP email renders accessible text and escapes names", () => {
  const message=otpEmail({firstName:"<script>",code:"123456",purpose:"sign in",expiresMinutes:10});
  assert.match(message.text,/123456/);
  assert.match(message.text,/10 minutes/);
  assert.doesNotMatch(message.html,/<script>/);
  assert.match(message.html,/123456/);
});
