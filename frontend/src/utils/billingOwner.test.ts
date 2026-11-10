import test from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentBillingOwner } from './billingOwner';

test('accepts a response only for the currently authenticated owner', () => {
  assert.equal(isCurrentBillingOwner('user-a', 'user-a'), true);
  assert.equal(isCurrentBillingOwner('user-a', 'user-b'), false);
  assert.equal(isCurrentBillingOwner('user-a', undefined), false);
  assert.equal(isCurrentBillingOwner(undefined, 'user-a'), false);
  assert.equal(isCurrentBillingOwner(undefined, undefined), false);
  assert.equal(isCurrentBillingOwner('', ''), false);
});
