import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findPersistedScheduleMutation,
  isScheduleAbsentFromActiveList,
} from './scheduleMutationReconciliation';

const expected = {
  scheduleId: 'schedule-1',
  statuses: ['scheduled', 'publishing'],
  pinterestBoardId: 'board-new',
  pinterestAccountId: 'account-1',
};

const persisted = {
  id: 'schedule-1',
  pin_id: 'pin-1',
  status: 'scheduled',
  scheduled_at: '2026-11-09T18:00:00.000Z',
  pinterest_board_id: 'board-new',
  pinterest_account_id: 'account-1',
};

test('confirms the exact persisted schedule mutation', () => {
  assert.deepEqual(findPersistedScheduleMutation([persisted], expected), persisted);
});

test('accepts a matching schedule already claimed by the worker', () => {
  const publishing = { ...persisted, status: 'publishing' };
  assert.deepEqual(findPersistedScheduleMutation([publishing], expected), publishing);
});

test('does not confirm a different schedule, board, account, or status', () => {
  for (const row of [
    { ...persisted, id: 'schedule-other' },
    { ...persisted, pinterest_board_id: 'board-old' },
    { ...persisted, pinterest_account_id: 'account-other' },
    { ...persisted, status: 'failed' },
    { ...persisted, status: 'unknown' },
  ]) {
    assert.equal(findPersistedScheduleMutation([row], expected), null);
  }
});

test('does not confirm malformed, missing, or ambiguous schedule lists', () => {
  assert.equal(findPersistedScheduleMutation({ data: [persisted] }, expected), null);
  assert.equal(findPersistedScheduleMutation([], expected), null);
  assert.equal(findPersistedScheduleMutation([persisted, persisted], expected), null);
  assert.equal(findPersistedScheduleMutation([null, persisted], expected), persisted);
});

test('confirms cancellation only when a valid active schedule list omits the schedule', () => {
  assert.equal(isScheduleAbsentFromActiveList([], 'schedule-1'), true);
  assert.equal(isScheduleAbsentFromActiveList([{ ...persisted, id: 'schedule-2' }], 'schedule-1'), true);
  assert.equal(isScheduleAbsentFromActiveList([persisted], 'schedule-1'), false);
});

test('does not treat malformed or incomplete schedule lists as cancellation', () => {
  assert.equal(isScheduleAbsentFromActiveList(null, 'schedule-1'), false);
  assert.equal(isScheduleAbsentFromActiveList({ data: [] }, 'schedule-1'), false);
  assert.equal(isScheduleAbsentFromActiveList([null], 'schedule-1'), false);
  assert.equal(isScheduleAbsentFromActiveList([{}], 'schedule-1'), false);
  assert.equal(isScheduleAbsentFromActiveList([{ id: '' }], 'schedule-1'), false);
  assert.equal(isScheduleAbsentFromActiveList([{ id: 'schedule-2' }], 'schedule-1'), false);
  assert.equal(isScheduleAbsentFromActiveList([{ ...persisted, scheduled_at: 'not-a-date' }], 'schedule-1'), false);
  assert.equal(isScheduleAbsentFromActiveList([{ ...persisted, pinterest_board_id: undefined }], 'schedule-1'), false);
});
