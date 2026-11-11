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

test('only complete versioned account exports are accepted for download', () => {
  assert.equal(isCompleteAccountExport({ formatVersion: 1, degradedSections: [] }), true);
  assert.equal(isCompleteAccountExport({ formatVersion: 1, degradedSections: ['projects'] }), false);
  assert.equal(isCompleteAccountExport({ formatVersion: 2, degradedSections: [] }), false);
  assert.equal(isCompleteAccountExport({ degradedSections: [] }), false);
  assert.equal(isCompleteAccountExport({ formatVersion: 1 }), false);
  assert.equal(isCompleteAccountExport(null), false);
  assert.equal(isCompleteAccountExport([]), false);
});
