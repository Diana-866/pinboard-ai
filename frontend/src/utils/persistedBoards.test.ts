import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPersistedBoards, requireCreatedBoardResponse, requireUpdatedBoardResponse } from './persistedBoards';

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


test('rejects blank and whitespace-padded persisted board IDs', () => {
  assert.throws(() => mapPersistedBoards([{ id: ' ', title: 'Board' }], invalid), /Invalid boards response/);
  assert.throws(() => mapPersistedBoards([{ id: ' board-1 ', title: 'Board' }], invalid), /Invalid boards response/);
});

test('rejects duplicate persisted board IDs instead of producing colliding UI keys', () => {
  assert.throws(() => mapPersistedBoards([
    { id: 'board-1', title: 'First board' },
    { id: 'board-1', title: 'Second board' },
  ], invalid), /Invalid boards response/);
});

test('accepts a complete created-board response and trims its title', () => {
  assert.deepEqual(
    requireCreatedBoardResponse({ id: 'board-1', title: '  New board  ' }, invalid),
    { id: 'board-1', title: 'New board' },
  );
});

test('rejects malformed created-board responses before optimistic UI insertion', () => {
  for (const response of [
    null,
    [],
    {},
    { id: {}, title: 'Board' },
    { id: ' board-1 ', title: 'Board' },
    { id: 'board-1', title: '   ' },
    { id: 'board-1', title: { text: 'Board' } },
  ]) {
    assert.throws(() => requireCreatedBoardResponse(response, invalid), /Invalid boards response/);
  }
});

test('accepts an updated board response only for the requested board', () => {
  assert.deepEqual(
    requireUpdatedBoardResponse(
      { id: 'board-1', title: '  Updated  ', category: '  Travel  ' },
      'board-1',
      invalid,
    ),
    { id: 'board-1', title: 'Updated', category: 'Travel' },
  );
  assert.deepEqual(
    requireUpdatedBoardResponse(
      { id: 'board-1', title: 'Updated', category: null },
      'board-1',
      invalid,
    ),
    { id: 'board-1', title: 'Updated', category: null },
  );
});

test('rejects mismatched or malformed updated-board responses', () => {
  for (const response of [
    null,
    [],
    { id: 'another-board', title: 'Updated', category: 'Travel' },
    { id: 'board-1', title: '  ', category: 'Travel' },
    { id: 'board-1', title: 'Updated', category: {} },
  ]) {
    assert.throws(
      () => requireUpdatedBoardResponse(response, 'board-1', invalid),
      /Invalid boards response/,
    );
  }
});
