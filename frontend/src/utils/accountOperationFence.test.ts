import assert from 'node:assert/strict';
import test from 'node:test';
import { isAccountOperationCurrent } from './accountOperationFence';

test('accepts the current operation for the same authenticated owner', () => {
  assert.equal(isAccountOperationCurrent('user-a', 'user-a', 3, 3), true);
});

test('rejects a delayed operation after account switching', () => {
  assert.equal(isAccountOperationCurrent('user-b', 'user-a', 3, 3), false);
});

test('rejects an older operation after a newer request supersedes it', () => {
  assert.equal(isAccountOperationCurrent('user-a', 'user-a', 4, 3), false);
});

test('rejects missing owners and invalid request generations', () => {
  assert.equal(isAccountOperationCurrent('', '', 1, 1), false);
  assert.equal(isAccountOperationCurrent('user-a', undefined, 1, 1), false);
  assert.equal(isAccountOperationCurrent('user-a', 'user-a', 0, 0), false);
});
