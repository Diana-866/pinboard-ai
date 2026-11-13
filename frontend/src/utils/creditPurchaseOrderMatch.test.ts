import test from 'node:test';
import assert from 'node:assert/strict';
import { isMatchingCreditPurchaseOrder } from './creditPurchaseOrderMatch';

test('matches only the exact checkout order that was remembered before redirect', () => {
  assert.equal(isMatchingCreditPurchaseOrder('ppc-123', 'ppc-123'), true);
  assert.equal(isMatchingCreditPurchaseOrder('ppc-123', 'ppc-456'), false);
  assert.equal(isMatchingCreditPurchaseOrder('ppc-old', 'ppc-new'), false);
});

test('does not release a checkout key when either order identity is missing', () => {
  assert.equal(isMatchingCreditPurchaseOrder(null, 'ppc-123'), false);
  assert.equal(isMatchingCreditPurchaseOrder('ppc-123', null), false);
  assert.equal(isMatchingCreditPurchaseOrder(undefined, undefined), false);
  assert.equal(isMatchingCreditPurchaseOrder('', 'ppc-123'), false);
});
