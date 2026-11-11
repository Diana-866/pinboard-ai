import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPersistedBoards } from './persistedBoards';

const invalid = 'Invalid boards response';

test('maps persisted boards using their own category before the shared project niche', () => {
  const boards = mapPersistedBoards([
    {
      id: 'board-1',
      title: '  Interior ideas  ',
      description: '  Home Decor  ',
      projects: { niche: 'Fashion' },
    },
    {
      id: 'board-2',
      title: 'Recipes',
      description: 'Food',
      projects: [{ niche: 'Lifestyle' }],
    },
  ], invalid);

  assert.equal(boards.length, 2);
  assert.equal(boards[0].id, 'board-1');
  assert.equal(boards[0].name, 'Interior ideas');
  assert.equal(boards[0].category, 'Home Decor');
  assert.equal(boards[1].category, 'Food');
  assert.equal(boards[0].pinCount, 0);
});

test('falls back to project niche for legacy boards without a description', () => {
  const boards = mapPersistedBoards([
    { id: 'board-legacy', title: 'Legacy board', description: '', projects: { niche: 'Travel' } },
    { id: 'board-empty', title: 'Uncategorized', projects: { niche: '' } },
  ], invalid);

  assert.equal(boards[0].category, 'Travel');
  assert.equal(boards[1].category, '—');
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
