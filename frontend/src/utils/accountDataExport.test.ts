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

test('a complete, valid deletion receipt is accepted', () => {
  assert.deepEqual(
    parseDeletionReceipt({
      ok: true,
      request: {
        requestId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
        state: 'pending',
        requestedAt: '2026-11-12T00:00:00Z',
        alreadyRequested: false,
      },
    }),
    {
      requestId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      state: 'pending',
      alreadyRequested: false,
    }
  );
});

test('a malformed or contradictory deletion receipt never counts as success', () => {
  const validRequest = {
    requestId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    state: 'pending',
    alreadyRequested: false,
  };
  assert.equal(parseDeletionReceipt(null), null);
  assert.equal(parseDeletionReceipt({}), null);
  assert.equal(parseDeletionReceipt({ request: validRequest }), null);
  assert.equal(parseDeletionReceipt({ ok: false, request: validRequest }), null);
  assert.equal(parseDeletionReceipt({ ok: true }), null);
  assert.equal(parseDeletionReceipt({ ok: true, request: {} }), null);
  assert.equal(parseDeletionReceipt({ ok: true, request: { ...validRequest, requestId: 'req-1' } }), null);
  assert.equal(parseDeletionReceipt({ ok: true, request: { ...validRequest, state: 'deleted' } }), null);
  assert.equal(parseDeletionReceipt({ ok: true, request: { ...validRequest, alreadyRequested: 'false' } }), null);
  assert.equal(parseDeletionReceipt({ ok: true, request: { ...validRequest, alreadyRequested: undefined } }), null);
});
