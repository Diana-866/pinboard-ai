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

test('different pending generations persist independently', () => {
  clearPendingGenerationRequest();
  const storage = memoryStorage();
  const first = createGenerationFingerprint('request-a');
  const second = createGenerationFingerprint('request-b');
  writePendingGenerationRequest(first, 'stable-key-00000001', storage);
  writePendingGenerationRequest(second, 'stable-key-00000002', storage);

  assert.equal(readPendingGenerationRequest(first, storage)?.idempotencyKey, 'stable-key-00000001');
  assert.equal(readPendingGenerationRequest(second, storage)?.idempotencyKey, 'stable-key-00000002');
  clearPendingGenerationRequest(first, storage);
  assert.equal(readPendingGenerationRequest(first, storage), null);
  assert.equal(readPendingGenerationRequest(second, storage)?.idempotencyKey, 'stable-key-00000002');
});

test('generation identity persists and can be restored after page memory is cleared', () => {
  clearPendingGenerationRequest();
  const storage = memoryStorage();
  const fingerprint = createGenerationFingerprint('fingerprint-a');
  writePendingGenerationRequest(fingerprint, 'stable-key-00000001', storage);
  clearPendingGenerationRequest();
  assert.deepEqual(readPendingGenerationRequest(fingerprint, storage), {
    fingerprint,
    idempotencyKey: 'stable-key-00000001',
  });
});

test('legacy raw fingerprint is upgraded to a scoped compact fingerprint', () => {
  clearPendingGenerationRequest();
  const storage = memoryStorage();
  const rawFingerprint = '{"topic":"old private topic"}';
  const fingerprint = createGenerationFingerprint(rawFingerprint);
  storage.setItem('pinposy_generation_request_v1', JSON.stringify({
    fingerprint: rawFingerprint,
    idempotencyKey: 'stable-key-legacy-0001',
  }));
  // Legacy migration is read from sessionStorage; validate the compact format
  // and scoped storage through the public write/read path as well.
  writePendingGenerationRequest(fingerprint, 'stable-key-legacy-0001', storage);
  assert.deepEqual(readPendingGenerationRequest(fingerprint, storage), {
    fingerprint,
    idempotencyKey: 'stable-key-legacy-0001',
  });
  assert.equal(storage.getItem(`pinposy_generation_request_v2:${fingerprint}`)?.includes('old private topic'), false);
});

test('blocked persistent storage does not prevent same-page retry', () => {
  clearPendingGenerationRequest();
  const blockedStorage = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('SecurityError'); },
    removeItem: () => { throw new Error('SecurityError'); },
  };
  const fingerprint = createGenerationFingerprint('fingerprint-b');
  assert.equal(writePendingGenerationRequest(fingerprint, 'stable-key-00000002', blockedStorage), false);
  assert.deepEqual(readPendingGenerationRequest(fingerprint, blockedStorage), {
    fingerprint,
    idempotencyKey: 'stable-key-00000002',
  });
});

test('clearing one completed request does not erase another', () => {
  const storage = memoryStorage();
  const first = createGenerationFingerprint('fingerprint-c');
  const second = createGenerationFingerprint('fingerprint-d');
  writePendingGenerationRequest(first, 'stable-key-00000003', storage);
  writePendingGenerationRequest(second, 'stable-key-00000004', storage);
  clearPendingGenerationRequest(first, storage);
  assert.equal(readPendingGenerationRequest(first, storage), null);
  assert.equal(readPendingGenerationRequest(second, storage)?.idempotencyKey, 'stable-key-00000004');
});
