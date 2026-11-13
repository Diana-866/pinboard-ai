import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGeneratorBoardId } from './generatorBoardSelection';

test('keeps a valid board explicitly selected from the calendar', () => {
  assert.equal(resolveGeneratorBoardId('board-b', 'board-a', ['board-a', 'board-b']), 'board-b');
});

test('falls back to the topic recommendation when the preselected board no longer exists', () => {
  assert.equal(resolveGeneratorBoardId('deleted-board', 'board-b', ['board-a', 'board-b']), 'board-b');
});

test('falls back to the first available board when both preferred IDs are stale', () => {
  assert.equal(resolveGeneratorBoardId('deleted-board', 'also-deleted', ['board-a', 'board-b']), 'board-a');
});

test('returns an empty selection when the user has no available boards', () => {
  assert.equal(resolveGeneratorBoardId('deleted-board', undefined, []), '');
});
