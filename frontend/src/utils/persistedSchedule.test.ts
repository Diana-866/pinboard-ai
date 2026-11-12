import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePersistedScheduleRows } from './persistedSchedule';

const validRow = {
  id: 'schedule-1',
  pin_id: 'pin-1',
  status: 'failed',
  scheduled_at: '2026-11-09T18:00:00.000Z',
};

test('accepts an empty persisted schedule', () => {
  assert.deepEqual(validatePersistedScheduleRows([]), []);
});

test('preserves complete persisted schedule rows and failure metadata', () => {
  const row = { ...validRow, retryable: true, retry_reason: null, failure_reason: 'board_unavailable' };
  assert.deepEqual(validatePersistedScheduleRows([row]), [row]);
});

test('rejects a non-array schedule response', () => {
  assert.throws(() => validatePersistedScheduleRows({ data: [] }), /expected an array/);
});

test('rejects malformed rows instead of silently dropping publications', () => {
  for (const row of [
    null,
    {},
    { ...validRow, id: '' },
    { ...validRow, pin_id: '' },
    { ...validRow, status: null },
    { ...validRow, scheduled_at: 'not-a-date' },
  ]) {
    assert.throws(() => validatePersistedScheduleRows([row]));
  }
});

test('rejects duplicate schedule IDs instead of rendering ambiguous calendar entries', () => {
  assert.throws(
    () => validatePersistedScheduleRows([validRow, { ...validRow, pin_id: 'pin-2' }]),
    /duplicate schedule ID/
  );
});

test('treats IDs with surrounding whitespace as the same persisted identity', () => {
  assert.throws(
    () => validatePersistedScheduleRows([validRow, { ...validRow, id: ' schedule-1 ' }]),
    /duplicate schedule ID/
  );
});
