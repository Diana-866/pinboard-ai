import test from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentPinDescriptionSave } from './pinDescriptionSaveGuard';

test('accepts a save completion for the active board and latest revision', () => {
  assert.equal(isCurrentPinDescriptionSave({
    revision: 4, currentRevision: 4, boardId: 'board-a', currentBoardId: 'board-a',
  }), true);
});

test('rejects a completion from a previous board even when its revision matches', () => {
  assert.equal(isCurrentPinDescriptionSave({
    revision: 4, currentRevision: 4, boardId: 'board-a', currentBoardId: 'board-b',
  }), false);
});

test('rejects an older save completion on the same board', () => {
  assert.equal(isCurrentPinDescriptionSave({
    revision: 3, currentRevision: 4, boardId: 'board-a', currentBoardId: 'board-a',
  }), false);
});
