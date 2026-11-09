import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPersistedBoards } from './persistedBoards';

const invalid = 'Invalid boards response';

test('maps persisted boards and uses project niche when available', () => {
  const boards = mapPersistedBoards([
    {
      id: 'board-1',
      title: '  Interior ideas  ',
      description: 'fallback description',
      projects: { niche: '  Home Decor  ' },
    },
    {
      id: 'board-2',
      title: 'Recipes',
      description: 'Food',
      projects: [{ niche: '' }],
    },
  ], invalid);

  assert.equal(boards.length, 2);
  assert.equal(boards[0].id, 'board-1');
  assert.equal(boards[0].name, 'Interior ideas');
  assert.equal(boards[0].category, 'Home Decor');
  assert.equal(boards[1].category, 'Food');
  assert.equal(boards[0].pinCount, 0);
});

test('accepts an empty array as a valid account with no boards', () => {
  assert.deepEqual(mapPersistedBoards([], invalid), []);
});

test('rejects a non-array response instead of treating it as an empty board list', () => {
  assert.throws(() => mapPersistedBoards({ data: [] }, invalid), /Invalid boards response/);
});

test('rejects malformed rows instead of silently dropping boards', () => {
  assert.throws(() => mapPersistedBoards([{ id: 'board-1', title: '   ' }], invalid), /Invalid boards response/);
  assert.throws(() => mapPersistedBoards([null], invalid), /Invalid boards response/);
});
