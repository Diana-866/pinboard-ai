import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCurrentReviewEdits } from './reviewApproval';

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
