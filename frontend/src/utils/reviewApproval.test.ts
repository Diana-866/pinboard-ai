import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCurrentReviewEdits, canApproveReviewToPinterest, requirePinStatusResponse } from './reviewApproval';

const first = {
  id: 'pin-1',
  pinId: 'saved-1',
  title: 'Original title',
  description: 'Original description',
  boardId: 'board-1',
  scheduledDate: '2026-11-12',
  scheduledTime: '10:00',
  imageUrl: 'https://example.com/pin.jpg',
};

const edits = {
  title: 'Edited title',
  description: '',
  boardId: 'board-2',
  scheduledDate: '2026-11-13',
  scheduledTime: '11:30',
};

test('bulk approval preserves edits from the currently open review card', () => {
  assert.deepEqual(applyCurrentReviewEdits(first, 0, edits), {
    ...first,
    ...edits,
  });
});

test('bulk approval leaves other queue cards unchanged', () => {
  assert.equal(applyCurrentReviewEdits(first, 1, edits), first);
});

test('bulk approval keeps original schedule fields if the edit controls are empty', () => {
  assert.deepEqual(applyCurrentReviewEdits(first, 0, {
    ...edits,
    boardId: '',
    scheduledDate: '',
    scheduledTime: '',
  }), {
    ...first,
    title: edits.title,
    description: edits.description,
  });
});


test('review decision response must confirm the exact pin and requested status', () => {
  assert.doesNotThrow(() => requirePinStatusResponse(
    { id: 'saved-1', status: 'rejected' }, 'saved-1', 'rejected',
  ));
  assert.throws(() => requirePinStatusResponse(null, 'saved-1', 'rejected'));
  assert.throws(() => requirePinStatusResponse(
    { id: 'another-pin', status: 'rejected' }, 'saved-1', 'rejected',
  ));
  assert.throws(() => requirePinStatusResponse(
    { id: 'saved-1', status: 'approved' }, 'saved-1', 'rejected',
  ));
});


test('Pinterest approval requires the selected board to be loaded for the selected account', () => {
  const valid = {
    accountId: 'account-1', boardId: 'pinterest-board-1', boardsLoaded: true,
    boardsAccountId: 'account-1', boardsError: false, boards: [{ id: 'pinterest-board-1' }],
  };
  assert.equal(canApproveReviewToPinterest(valid), true);
  assert.equal(canApproveReviewToPinterest({ ...valid, boardsLoaded: false }), false);
  assert.equal(canApproveReviewToPinterest({ ...valid, boardsAccountId: 'account-2' }), false);
  assert.equal(canApproveReviewToPinterest({ ...valid, boardsError: true }), false);
  assert.equal(canApproveReviewToPinterest({ ...valid, boardId: 'stale-board' }), false);
  assert.equal(canApproveReviewToPinterest({ ...valid, accountId: '' }), false);
});
