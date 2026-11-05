import assert from 'node:assert/strict';
import { test } from 'node:test';

import { accessTokenIdentifier } from './auth.js';

test('uses a JWT identifier when SocketFi supplies one', () => {
  const jti = '018f47d2-8238-7d12-a0bb-8d4aa3796c91';
  assert.equal(accessTokenIdentifier('signed-token', jti), jti);
});

test('derives an opaque stable identifier for legacy SocketFi tokens without jti', () => {
  const first = accessTokenIdentifier('signed-token-a', undefined);
  assert.equal(first, accessTokenIdentifier('signed-token-a', undefined));
  assert.notEqual(first, accessTokenIdentifier('signed-token-b', undefined));
  assert.notEqual(first, 'signed-token-a');
});
