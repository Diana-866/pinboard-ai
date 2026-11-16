import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPendingGenerationRequest,
  listPendingGenerationRequests,
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
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
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

test('legacy raw fingerprint is upgraded and migrated from session storage', () => {
  clearPendingGenerationRequest();
  const storage = memoryStorage();
  const sessionStorage = memoryStorage();
  const rawFingerprint = '{"topic":"old private topic"}';
  const fingerprint = createGenerationFingerprint(rawFingerprint);
  sessionStorage.setItem('pinposy_generation_request_v1', JSON.stringify({
    fingerprint: rawFingerprint,
    idempotencyKey: 'stable-key-legacy-0001',
  }));
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { sessionStorage },
  });
  try {
    assert.deepEqual(readPendingGenerationRequest(fingerprint, storage), {
      fingerprint,
      idempotencyKey: 'stable-key-legacy-0001',
    });
    assert.equal(storage.getItem(`pinposy_generation_request_v2:${fingerprint}`)?.includes('old private topic'), false);
    assert.equal(sessionStorage.getItem('pinposy_generation_request_v1'), null);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
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

test('rejects malformed persisted identities before they can be retried', () => {
  clearPendingGenerationRequest();
  const storage = memoryStorage();
  const fingerprint = createGenerationFingerprint('malformed-identity');
  storage.setItem(`pinposy_generation_request_v2:${fingerprint}`, JSON.stringify({
    fingerprint,
    idempotencyKey: 'not-a-valid-key',
  }));
  assert.equal(readPendingGenerationRequest(fingerprint, storage), null);
  assert.equal(listPendingGenerationRequests(storage).length, 0);
});

test('does not persist invalid idempotency keys or malformed fp1 fingerprints', () => {
  clearPendingGenerationRequest();
  const storage = memoryStorage();
  const fingerprint = createGenerationFingerprint('invalid-write');
  assert.equal(writePendingGenerationRequest(fingerprint, 'short', storage), false);
  assert.equal(writePendingGenerationRequest('fp1:invalid', 'stable-key-valid-0001', storage), false);
  assert.equal(storage.length, 0);
  assert.equal(listPendingGenerationRequests(storage).length, 0);
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

test('session storage is used when accessing local storage itself is blocked', () => {
  clearPendingGenerationRequest();
  const sessionStorage = memoryStorage();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    get() {
      return {
        get localStorage() { throw new Error('SecurityError'); },
        sessionStorage,
      };
    },
  });
  const fingerprint = createGenerationFingerprint('storage-access-blocked');
  try {
    assert.equal(writePendingGenerationRequest(fingerprint, 'stable-key-fallback-0001'), false);
    assert.deepEqual(readPendingGenerationRequest(fingerprint), {
      fingerprint,
      idempotencyKey: 'stable-key-fallback-0001',
    });
    assert.ok(sessionStorage.getItem(`pinposy_generation_request_v2:${fingerprint}`));
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    clearPendingGenerationRequest();
  }
});

test('full cleanup removes all scoped generation records', () => {
  clearPendingGenerationRequest();
  const storage = memoryStorage();
  const first = createGenerationFingerprint('cleanup-a');
  const second = createGenerationFingerprint('cleanup-b');
  writePendingGenerationRequest(first, 'stable-key-cleanup-0001', storage);
  writePendingGenerationRequest(second, 'stable-key-cleanup-0002', storage);
  assert.equal(storage.length, 2);
  clearPendingGenerationRequest(undefined, storage);
  assert.equal(storage.length, 0);
});


test('enumerates pending identities from persistent storage without changing them', () => {
  clearPendingGenerationRequest();
  const storage = memoryStorage();
  const first = createGenerationFingerprint('recovery-a');
  const second = createGenerationFingerprint('recovery-b');
  writePendingGenerationRequest(first, 'stable-key-recovery-0001', storage);
  writePendingGenerationRequest(second, 'stable-key-recovery-0002', storage);

  const listed = listPendingGenerationRequests(storage);
  assert.deepEqual(new Set(listed.map((item) => item.fingerprint)), new Set([first, second]));
  assert.equal(storage.length, 2);
  assert.equal(readPendingGenerationRequest(first, storage)?.idempotencyKey, 'stable-key-recovery-0001');
});

test('merges session fallback, deduplicates identities, and ignores malformed entries', () => {
  clearPendingGenerationRequest();
  const persistent = memoryStorage();
  const session = memoryStorage();
  const first = createGenerationFingerprint('recovery-session-a');
  const second = createGenerationFingerprint('recovery-session-b');
  persistent.setItem(`pinposy_generation_request_v2:${first}`, JSON.stringify({
    fingerprint: first, idempotencyKey: 'stable-key-session-0001',
  }));
  session.setItem(`pinposy_generation_request_v2:${first}`, JSON.stringify({
    fingerprint: first, idempotencyKey: 'stable-key-session-0001',
  }));
  session.setItem(`pinposy_generation_request_v2:${second}`, JSON.stringify({
    fingerprint: second, idempotencyKey: 'stable-key-session-0002',
  }));
  session.setItem('pinposy_generation_request_v2:bad', JSON.stringify({
    fingerprint: 'bad', idempotencyKey: 'short',
  }));

  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { sessionStorage: session } });
  try {
    const listed = listPendingGenerationRequests(persistent);
    assert.equal(listed.length, 2);
    assert.equal(listed.find((item) => item.fingerprint === second)?.idempotencyKey, 'stable-key-session-0002');
    assert.equal(session.length, 3);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    clearPendingGenerationRequest();
  }
});


test('generation recovery identities are isolated by authenticated owner', async () => {
  const storage = memoryStorage();
  const { writePendingGenerationRequestForOwner, readPendingGenerationRequestForOwner,
    listPendingGenerationRequestsForOwner, clearPendingGenerationRequestForOwner } =
    await import('./pendingGenerationRequest');
  const fingerprint = createGenerationFingerprint('same request on two accounts');
  writePendingGenerationRequestForOwner('user-a', fingerprint, 'stable-key-owner-a-0001', storage);
  writePendingGenerationRequestForOwner('user-b', fingerprint, 'stable-key-owner-b-0001', storage);

  assert.equal(readPendingGenerationRequestForOwner('user-a', fingerprint, storage)?.idempotencyKey, 'stable-key-owner-a-0001');
  assert.equal(readPendingGenerationRequestForOwner('user-b', fingerprint, storage)?.idempotencyKey, 'stable-key-owner-b-0001');
  assert.equal(listPendingGenerationRequestsForOwner('user-a', storage).length, 1);
  assert.equal(listPendingGenerationRequestsForOwner('user-b', storage).length, 1);
  clearPendingGenerationRequestForOwner('user-a', fingerprint, storage);
  assert.equal(readPendingGenerationRequestForOwner('user-a', fingerprint, storage), null);
  assert.equal(readPendingGenerationRequestForOwner('user-b', fingerprint, storage)?.idempotencyKey, 'stable-key-owner-b-0001');
});

test('account-scoped recovery does not import legacy unowned generation keys', async () => {
  const storage = memoryStorage();
  const { listPendingGenerationRequestsForOwner } = await import('./pendingGenerationRequest');
  const fingerprint = createGenerationFingerprint('legacy unowned request');
  storage.setItem(`pinposy_generation_request_v2:${fingerprint}`, JSON.stringify({
    fingerprint, idempotencyKey: 'stable-key-legacy-owner-0001',
  }));
  assert.deepEqual(listPendingGenerationRequestsForOwner('user-new', storage), []);
});
