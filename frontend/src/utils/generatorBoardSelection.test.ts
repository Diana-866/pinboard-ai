import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGeneratorBoardId } from './generatorBoardSelection';

test('keeps a valid board explicitly selected from the calendar', () => {
  assert.equal(resolveGeneratorBoardId('board-b', 'board-a', ['board-a', 'board-b']), 'board-b');
});

test('falls back to the topic recommendation when the preselected board no longer exists', () => {
  assert.equal(resolveGeneratorBoardId('deleted-board', 'board-b', ['board-a', 'board-b']), 'board-b');
});

test('preserves a valid manual selection when topic recommendations change', () => {
  assert.equal(resolveGeneratorBoardId(undefined, 'board-a', ['board-a', 'board-b'], 'board-b', true), 'board-b');
});

test('preserves a valid manual selection when the board list refreshes', () => {
  assert.equal(resolveGeneratorBoardId(undefined, 'board-a', ['board-a', 'board-b'], 'board-b', true), 'board-b');
});

test('falls back to the topic recommendation when the manually selected board disappears', () => {
  assert.equal(resolveGeneratorBoardId(undefined, 'board-a', ['board-a', 'board-c'], 'deleted-board', true), 'board-a');
});

test('falls back to the first available board when both preferred IDs are stale', () => {
  assert.equal(resolveGeneratorBoardId('deleted-board', 'also-deleted', ['board-a', 'board-b']), 'board-a');
});

test('returns an empty selection when the user has no available boards', () => {
  assert.equal(resolveGeneratorBoardId('deleted-board', undefined, []), '');
});
