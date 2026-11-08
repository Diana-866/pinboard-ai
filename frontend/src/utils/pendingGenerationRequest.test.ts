import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPendingGenerationRequest,
  createGenerationFingerprint,
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

test('generation fingerprint is stable and does not contain the original topic', () => {
  const raw = JSON.stringify({ topic: 'private campaign idea', boardId: 'board-1' });
  const fingerprint = createGenerationFingerprint(raw);
  assert.equal(fingerprint, createGenerationFingerprint(raw));
  assert.match(fingerprint, /^fp1:[a-f0-9]{16}$/);
  assert.equal(fingerprint.includes('private campaign idea'), false);
});

test('generation identity persists and can be restored after page memory is cleared', () => {
  clearPendingGenerationRequest(undefined);
  const storage = memoryStorage();
  const fingerprint = createGenerationFingerprint('fingerprint-a');
  assert.equal(writePendingGenerationRequest(fingerprint, 'stable-key-00000001', storage), true);
  clearPendingGenerationRequest(undefined);
  assert.deepEqual(readPendingGenerationRequest(storage), {
    fingerprint,
    idempotencyKey: 'stable-key-00000001',
  });
});

test('legacy raw fingerprint is upgraded to a compact fingerprint', () => {
  clearPendingGenerationRequest(undefined);
  const storage = memoryStorage();
  storage.setItem('pinposy_generation_request_v1', JSON.stringify({
    fingerprint: '{"topic":"old private topic"}',
    idempotencyKey: 'stable-key-legacy-0001',
  }));
  assert.deepEqual(readPendingGenerationRequest(storage), {
    fingerprint: createGenerationFingerprint('{"topic":"old private topic"}'),
    idempotencyKey: 'stable-key-legacy-0001',
  });
  assert.equal(storage.getItem('pinposy_generation_request_v1')?.includes('old private topic'), false);
});

test('blocked persistent storage does not prevent same-page retry', () => {
  clearPendingGenerationRequest(undefined);
  const blockedStorage = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('SecurityError'); },
    removeItem: () => { throw new Error('SecurityError'); },
  };
  const fingerprint = createGenerationFingerprint('fingerprint-b');
  assert.equal(writePendingGenerationRequest(fingerprint, 'stable-key-00000002', blockedStorage), false);
  assert.deepEqual(readPendingGenerationRequest(blockedStorage), {
    fingerprint,
    idempotencyKey: 'stable-key-00000002',
  });
});

test('clearing a completed request removes the persisted identity', () => {
  const storage = memoryStorage();
  writePendingGenerationRequest(createGenerationFingerprint('fingerprint-c'), 'stable-key-00000003', storage);
  clearPendingGenerationRequest(storage);
  assert.equal(readPendingGenerationRequest(storage), null);
});
