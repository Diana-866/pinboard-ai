import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDisconnectedPinterestAccount } from './pinterestAccountState';

test('removes only the disconnected account and selects a remaining account', () => {
  const a = { id: 'a', username: 'first' };
  const b = { id: 'b', username: 'second' };
  const result = reconcileDisconnectedPinterestAccount([a, b], {
    configured: true, connected: true, account_count: 2, account_limit: 3,
  }, 'a');
  assert.deepEqual(result.accounts, [b]);
  assert.equal(result.selectedAccountId, 'b');
  assert.equal(result.status.connected, true);
  assert.equal(result.status.account_count, 1);
  assert.equal(result.status.account_limit, 3);
});

test('clears selection and connected state when last account is disconnected', () => {
  const result = reconcileDisconnectedPinterestAccount([{ id: 'a' }], {
    configured: true, connected: true, account_count: 1,
  }, 'a');
  assert.deepEqual(result.accounts, []);
  assert.equal(result.selectedAccountId, null);
  assert.equal(result.status.connected, false);
  assert.equal(result.status.account_count, 0);
});

test('prefers the authoritative account list returned by disconnect API', () => {
  const current = [{ id: 'a' }, { id: 'b' }];
  const server = [{ id: 'b' }, { id: 'c' }];
  const result = reconcileDisconnectedPinterestAccount(current, null, 'a', server);
  assert.deepEqual(result.accounts, server);
  assert.equal(result.status.connected, true);
});


test('detects when the connected account limit is reached', () => {
  assert.equal(isPinterestAccountLimitReached(2, 2), true);
  assert.equal(isPinterestAccountLimitReached(3, 2), true);
  assert.equal(isPinterestAccountLimitReached(1, 2), false);
  assert.equal(isPinterestAccountLimitReached(20, null), false);
  assert.equal(isPinterestAccountLimitReached(0, undefined), false);
  assert.equal(isPinterestAccountLimitReached(0, 0), true);
});
