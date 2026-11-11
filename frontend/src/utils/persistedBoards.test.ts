import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPersistedBoards } from './persistedBoards';

const invalid = 'Invalid boards response';

test('prefers the dedicated category field for persisted manual boards', () => {
  const boards = mapPersistedBoards([
    { id: 'board-1', title: 'Interior ideas', category: 'Home Decor', description: '', projects: { niche: 'Fashion' } },
  ], invalid);

  assert.equal(boards[0].category, 'Home Decor');
});

test('recovers known legacy categories stored in description', () => {
  const boards = mapPersistedBoards([
    { id: 'board-legacy', title: 'Recipes', description: ' Recipes ', projects: { niche: 'Lifestyle' } },
  ], invalid);

  assert.equal(boards[0].category, 'Recipes');
});

test('does not mistake generated SEO descriptions for categories', () => {
  const boards = mapPersistedBoards([
    {
      id: 'board-generated',
      title: 'Small kitchen storage ideas',
      description: 'Discover clever storage ideas for compact kitchens and apartments.',
      projects: { niche: 'Home Decor' },
    },
  ], invalid);

  assert.equal(boards[0].category, 'Home Decor');
});

test('uses project niche for legacy boards without a recoverable category', () => {
  const boards = mapPersistedBoards([
    { id: 'board-old', title: 'Older board', description: 'A long description', projects: { niche: 'Travel' } },
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
