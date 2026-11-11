import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountExportFilename, parseDeletionReceipt } from './accountDataExport';

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
      request: { requestId: 'req-1', state: 'pending', requestedAt: '2026-11-12T00:00:00Z', alreadyRequested: false },
    }),
    { requestId: 'req-1', state: 'pending', alreadyRequested: false }
  );
  assert.deepEqual(
    parseDeletionReceipt({ request: { requestId: 'req-2', state: 'pending', alreadyRequested: true } }),
    { requestId: 'req-2', state: 'pending', alreadyRequested: true }
  );
});

test('a malformed deletion receipt never counts as success', () => {
  assert.equal(parseDeletionReceipt(null), null);
  assert.equal(parseDeletionReceipt({}), null);
  assert.equal(parseDeletionReceipt({ ok: true }), null);
  assert.equal(parseDeletionReceipt({ request: {} }), null);
  assert.equal(parseDeletionReceipt({ request: { requestId: '', state: 'pending' } }), null);
  assert.equal(parseDeletionReceipt({ request: { requestId: 'req-1' } }), null);
});
