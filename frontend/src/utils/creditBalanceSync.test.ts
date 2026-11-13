import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRefreshCreditBalance } from './creditBalanceSync';

test('refreshes the profile when the billing ledger has a newer credit balance', () => {
  assert.equal(shouldRefreshCreditBalance(600, 100), true);
  assert.equal(shouldRefreshCreditBalance('600', 100), true);
  assert.equal(shouldRefreshCreditBalance(100, 100), false);
  assert.equal(shouldRefreshCreditBalance(0, 0), false);
});

test('does not refresh from absent or malformed billing balances', () => {
  assert.equal(shouldRefreshCreditBalance(undefined, 100), false);
  assert.equal(shouldRefreshCreditBalance(null, 100), false);
  assert.equal(shouldRefreshCreditBalance('', 100), false);
  assert.equal(shouldRefreshCreditBalance('not-a-number', 100), false);
  assert.equal(shouldRefreshCreditBalance(100, 'not-a-number'), false);
});
