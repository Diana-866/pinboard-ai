import test from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentAuthRefresh } from './authRefreshFence';

test('accepts only the latest refresh for the same non-empty token', () => {
  assert.equal(isCurrentAuthRefresh({ requestId: 4, token: 'token-a' }, 4, 'token-a'), true);
});

test('ignores a response from an earlier refresh request', () => {
  assert.equal(isCurrentAuthRefresh({ requestId: 3, token: 'token-a' }, 4, 'token-a'), false);
});

test('ignores a response after the authenticated token changes', () => {
  assert.equal(isCurrentAuthRefresh({ requestId: 4, token: 'token-a' }, 4, 'token-b'), false);
});

test('ignores a response after the token is cleared', () => {
  assert.equal(isCurrentAuthRefresh({ requestId: 4, token: 'token-a' }, 4, null), false);
});

test('does not accept a snapshot without a token', () => {
  assert.equal(isCurrentAuthRefresh({ requestId: 4, token: '' }, 4, ''), false);
});
