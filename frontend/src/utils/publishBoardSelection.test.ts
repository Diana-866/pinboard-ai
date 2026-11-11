import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublishBoardId } from './publishBoardSelection';

const boards = [{ id: 'board-a' }, { id: 'board-b' }];

test('keeps an explicitly requested board only when it belongs to the selected account', () => {
  assert.equal(resolvePublishBoardId(boards, 'board-b'), 'board-b');
  assert.equal(resolvePublishBoardId(boards, 'board-from-another-account'), '');
});

test('selects the first available board only when no explicit destination was supplied', () => {
  assert.equal(resolvePublishBoardId(boards), 'board-a');
  assert.equal(resolvePublishBoardId([], undefined), '');
  assert.equal(resolvePublishBoardId([], 'board-a'), '');
});
