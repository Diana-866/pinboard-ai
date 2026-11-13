import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseRememberedPaymentKey } from './billing';

test('a stale payment cannot release the idempotency key of a newer checkout', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage },
  });

  try {
    const scope = 'subscription:pro:rub';
    values.set(`pinposy:payment-idempotency:${scope}`, 'new-idempotency-key-0001');
    values.set(`pinposy:payment-order:${scope}`, 'pp-new-order');

    assert.equal(releaseRememberedPaymentKey(scope, 'pp-old-order'), false);
    assert.equal(values.get(`pinposy:payment-idempotency:${scope}`), 'new-idempotency-key-0001');
    assert.equal(values.get(`pinposy:payment-order:${scope}`), 'pp-new-order');

    assert.equal(releaseRememberedPaymentKey(scope, 'pp-new-order'), true);
    assert.equal(values.has(`pinposy:payment-idempotency:${scope}`), false);
    assert.equal(values.has(`pinposy:payment-order:${scope}`), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete (globalThis as any).window;
  }
});
