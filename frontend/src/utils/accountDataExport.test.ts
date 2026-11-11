import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountExportFilename, isCompleteAccountExport, parseDeletionReceipt } from './accountDataExport';

test('export filename is deterministic, UTC-based and sanitized', () => {
  const now = new Date('2026-11-12T08:05:09Z');
  assert.equal(
    buildAccountExportFilename('3f2504e0-4f89-41d3-9a0c-0305e82c3301', now),
    'pinposy-export-20261112-080509-3f2504e0.json'
  );
  assert.equal(buildAccountExportFilename('', now), 'pinposy-export-20261112-080509-account.json');
});

test('a well-formed deletion receipt is accepted', () => {
  assert.deepEqual(
    parseDeletionReceipt({
      ok: true,
      request: { requestId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', state: 'pending', requestedAt: '2026-11-12T00:00:00Z', alreadyRequested: false },
    }),
    { requestId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', state: 'pending', alreadyRequested: false }
  );
  assert.deepEqual(
    parseDeletionReceipt({ ok: true, request: { requestId: '3f2504e0-4f89-41d3-9a0c-0305e82c3302', state: 'pending', alreadyRequested: true } }),
    { requestId: '3f2504e0-4f89-41d3-9a0c-0305e82c3302', state: 'pending', alreadyRequested: true }
  );
});

test('a malformed deletion receipt never counts as success', () => {
  assert.equal(parseDeletionReceipt(null), null);
  assert.equal(parseDeletionReceipt({}), null);
  assert.equal(parseDeletionReceipt({ ok: true }), null);
  assert.equal(parseDeletionReceipt({ ok: false, request: { requestId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', state: 'pending', alreadyRequested: false } }), null);
  assert.equal(parseDeletionReceipt({ ok: true, request: { requestId: 'req-1', state: 'pending', alreadyRequested: false } }), null);
  assert.equal(parseDeletionReceipt({ ok: true, request: { requestId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', state: 'canceled', alreadyRequested: false } }), null);
  assert.equal(parseDeletionReceipt({ ok: true, request: { requestId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', state: 'pending', alreadyRequested: 'false' } }), null);
  assert.equal(parseDeletionReceipt({ request: {} }), null);
  assert.equal(parseDeletionReceipt({ request: { requestId: '', state: 'pending' } }), null);
  assert.equal(parseDeletionReceipt({ request: { requestId: 'req-1' } }), null);
});

const completeExport = {
  formatVersion: 1,
  generatedAt: '2026-11-12T00:00:00.000Z',
  account: { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' },
  projects: [],
  boards: [],
  pins: [],
  creditTransactions: [],
  subscriptions: [],
  creditPurchases: [],
  pinterestAccounts: [],
  pinterestPublications: [],
  pinSchedules: [],
  reviewQueue: [],
  degradedSections: [],
};

test('only structurally complete versioned account exports are accepted for download', () => {
  assert.equal(isCompleteAccountExport(completeExport, USER_ID), true);
  assert.equal(isCompleteAccountExport({ ...completeExport, degradedSections: ['projects'] }, USER_ID), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, formatVersion: 2 }, USER_ID), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, account: null }, USER_ID), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, pins: undefined }, USER_ID), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, account: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }, USER_ID), false);
  assert.equal(isCompleteAccountExport(completeExport, 'not-a-user-id'), false);
  assert.equal(isCompleteAccountExport({ formatVersion: 1, degradedSections: [] }, USER_ID), false);
  assert.equal(isCompleteAccountExport({ degradedSections: [] }, USER_ID), false);
  assert.equal(isCompleteAccountExport({ formatVersion: 1 }, USER_ID), false);
  assert.equal(isCompleteAccountExport(null, USER_ID), false);
  assert.equal(isCompleteAccountExport([], USER_ID), false);
});


test('download helper releases its Blob URL even when DOM insertion fails', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const scheduled = [];
  const created = [];
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({ click() {}, parentNode: null }),
      body: { appendChild() { throw new Error('DOM unavailable'); } },
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); } },
  });
  URL.createObjectURL = () => {
    const value = 'blob:test-export';
    created.push(value);
    return value;
  };
  URL.revokeObjectURL = (value) => { created.push(`revoked:${value}`); };
  try {
    assert.throws(() => downloadJsonFile('account.json', { ok: true }), /DOM unavailable/);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].delay, 1000);
    scheduled[0].callback();
    assert.deepEqual(created, ['blob:test-export', 'revoked:blob:test-export']);
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  }
});
