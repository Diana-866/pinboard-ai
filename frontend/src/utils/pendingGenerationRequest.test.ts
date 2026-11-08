import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPendingGenerationRequest,
  readPendingGenerationRequest,
  writePendingGenerationRequest,
} from './pendingGenerationRequest';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test('generation identity persists and is restored from session storage', () => {
  clearPendingGenerationRequest(undefined);
  const storage = memoryStorage();
  assert.equal(writePendingGenerationRequest('fingerprint-a', 'stable-key-00000001', storage), true);
  assert.deepEqual(readPendingGenerationRequest(storage), {
    fingerprint: 'fingerprint-a',
    idempotencyKey: 'stable-key-00000001',
  });
});

test('blocked session storage does not prevent generation or same-page retry', () => {
  clearPendingGenerationRequest(undefined);
  const blockedStorage = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('SecurityError'); },
    removeItem: () => { throw new Error('SecurityError'); },
  };
  assert.equal(writePendingGenerationRequest('fingerprint-b', 'stable-key-00000002', blockedStorage), false);
  assert.deepEqual(readPendingGenerationRequest(blockedStorage), {
    fingerprint: 'fingerprint-b',
    idempotencyKey: 'stable-key-00000002',
  });
});

test('clearing a completed request removes only the active in-memory identity', () => {
  const storage = memoryStorage();
  writePendingGenerationRequest('fingerprint-c', 'stable-key-00000003', storage);
  clearPendingGenerationRequest(storage);
  assert.equal(readPendingGenerationRequest(storage), null);
});
