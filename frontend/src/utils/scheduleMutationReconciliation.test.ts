import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findPersistedScheduleMutation,
  isPersistedScheduleMutationResponse,
  findPersistedScheduleRequest,
  isScheduleAbsentFromActiveList,
  isPersistedScheduleCancellationResponse,
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

test('validates direct mutation responses with the same strict persisted contract', () => {
  assert.equal(isPersistedScheduleMutationResponse(persisted, expected), true);
  assert.equal(isPersistedScheduleMutationResponse({ ...persisted, status: 'failed' }, expected), false);
  assert.equal(isPersistedScheduleMutationResponse({ ...persisted, pinterest_board_id: 'board-old' }, expected), false);
  assert.equal(isPersistedScheduleMutationResponse({ ...persisted, scheduled_at: 'invalid' }, expected), false);
  assert.equal(isPersistedScheduleMutationResponse({ id: persisted.id, status: 'scheduled' }, expected), false);
});

test('validates a failed-schedule board change against the requested board and original account', () => {
  const boardChange = {
    ...expected,
    pinterestBoardId: 'board-replacement',
  };
  assert.equal(isPersistedScheduleMutationResponse({
    ...persisted,
    pinterest_board_id: 'board-replacement',
  }, boardChange), true);
  assert.equal(isPersistedScheduleMutationResponse({
    ...persisted,
    pinterest_board_id: 'board-replacement',
    pinterest_account_id: 'account-other',
  }, boardChange), false);
  assert.equal(isPersistedScheduleMutationResponse({
    ...persisted,
    pinterest_board_id: 'board-old',
  }, boardChange), false);
});

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
  assert.equal(findPersistedScheduleMutation([null, persisted], expected), null);
  assert.equal(findPersistedScheduleMutation([{ ...persisted, scheduled_at: 'invalid' }, persisted], expected), null);
});

test('accepts a cancellation response only for the exact schedule in cancelled state', () => {
  const cancelled = { ...persisted, status: 'cancelled' };
  assert.equal(isPersistedScheduleCancellationResponse(cancelled, 'schedule-1'), true);
  assert.equal(isPersistedScheduleCancellationResponse({ ...cancelled, id: 'schedule-other' }, 'schedule-1'), false);
  assert.equal(isPersistedScheduleCancellationResponse(persisted, 'schedule-1'), false);
  assert.equal(isPersistedScheduleCancellationResponse({ ...cancelled, scheduled_at: 'invalid' }, 'schedule-1'), false);
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


test('reconciles a lost schedule-create response only against one exact active row', () => {
  const expectedRequest = {
    pinId: 'pin-1',
    scheduledAt: persisted.scheduled_at,
    pinterestBoardId: 'board-new',
    pinterestAccountId: 'account-1',
    statuses: ['scheduled', 'publishing', 'failed', 'unknown'],
  };
  assert.deepEqual(findPersistedScheduleRequest([persisted], expectedRequest), persisted);
  assert.deepEqual(
    findPersistedScheduleRequest([{ ...persisted, status: 'publishing' }], expectedRequest),
    { ...persisted, status: 'publishing' },
  );
});

test('does not reconcile schedule creation against a different time, destination, state, or ambiguous row', () => {
  const expectedRequest = {
    pinId: 'pin-1',
    scheduledAt: persisted.scheduled_at,
    pinterestBoardId: 'board-new',
    pinterestAccountId: 'account-1',
    statuses: ['scheduled', 'publishing', 'failed', 'unknown'],
  };
  for (const row of [
    { ...persisted, scheduled_at: '2026-11-09T18:15:00.000Z' },
    { ...persisted, pinterest_board_id: 'board-other' },
    { ...persisted, pinterest_account_id: 'account-other' },
    { ...persisted, status: 'cancelled' },
    { ...persisted, scheduled_at: 'not-a-date' },
    { ...persisted, id: '' },
  ]) {
    assert.equal(findPersistedScheduleRequest([row], expectedRequest), null);
  }
  assert.equal(findPersistedScheduleRequest([persisted, persisted], expectedRequest), null);
  assert.equal(findPersistedScheduleRequest([null, persisted], expectedRequest), null);
  assert.equal(findPersistedScheduleRequest({ data: [persisted] }, expectedRequest), null);
});
