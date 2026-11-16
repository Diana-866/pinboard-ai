import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPaymentIdempotencyStorageKey } from './paymentIdempotencyStorageKey';

test('builds a stable key for one owner and checkout scope', () => {
  assert.equal(
    buildPaymentIdempotencyStorageKey('user-a', 'subscription:start:rub'),
    'pinposy:payment-idempotency:user-a:subscription:start:rub',
  );
});

test('keeps identical checkout scopes isolated between authenticated owners', () => {
  assert.notEqual(
    buildPaymentIdempotencyStorageKey('user-a', 'credits:pack_100:rub'),
    buildPaymentIdempotencyStorageKey('user-b', 'credits:pack_100:rub'),
  );
});

test('rejects empty owner or checkout scope', () => {
  assert.throws(() => buildPaymentIdempotencyStorageKey('', 'subscription:start:rub'));
  assert.throws(() => buildPaymentIdempotencyStorageKey('user-a', ''));
});
