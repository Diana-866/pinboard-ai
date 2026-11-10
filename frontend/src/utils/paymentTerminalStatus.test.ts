import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTerminalCreditPurchaseStatus,
  isTerminalSubscriptionPaymentStatus,
} from './paymentTerminalStatus';

test('subscription payment terminal states are explicitly allowlisted', () => {
  for (const status of ['success', 'canceled', 'denied', 'expired']) {
    assert.equal(isTerminalSubscriptionPaymentStatus(status), true, status);
  }

  for (const status of ['pending', 'unknown', 'processing', 'created', '', null, undefined, 0]) {
    assert.equal(isTerminalSubscriptionPaymentStatus(status), false, String(status));
  }
});

test('credit purchase terminal states are explicitly allowlisted', () => {
  for (const status of ['success', 'canceled', 'denied']) {
    assert.equal(isTerminalCreditPurchaseStatus(status), true, status);
  }

  for (const status of ['pending', 'unknown', 'processing', 'created', 'expired', '', null, undefined, 0]) {
    assert.equal(isTerminalCreditPurchaseStatus(status), false, String(status));
  }
});
