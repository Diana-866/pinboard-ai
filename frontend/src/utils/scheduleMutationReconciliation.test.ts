import test from 'node:test';
import assert from 'node:assert/strict';
import { findPersistedScheduleMutation } from './scheduleMutationReconciliation';

const expected = {
  scheduleId: 'schedule-1',
  statuses: ['scheduled', 'publishing'],
  pinterestBoardId: 'board-new',
  pinterestAccountId: 'account-1',
};

const persisted = {
  id: 'schedule-1',
  status: 'scheduled',
  pinterest_board_id: 'board-new',
  pinterest_account_id: 'account-1',
};

test('confirms the exact persisted schedule mutation', () => {
  assert.deepEqual(findPersistedScheduleMutation([persisted], expected), persisted);
});

test('accepts a matching schedule already claimed by the worker', () => {\n  const publishing = { ...persisted, status: 'publishing' };\n  assert.deepEqual(findPersistedScheduleMutation([publishing], expected), publishing);\n});\n\ntest('does not confirm a different schedule, board, account, or status', () => {
  for (const row of [
    { ...persisted, id: 'schedule-other' },
    { ...persisted, pinterest_board_id: 'board-old' },
    { ...persisted, pinterest_account_id: 'account-other' },
    { ...persisted, status: 'failed' },\n    { ...persisted, status: 'unknown' },
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
