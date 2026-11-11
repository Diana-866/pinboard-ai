import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldFlushPendingPinDescription } from './pendingPinDescriptionSwitch';

test('does not flush when editing the same pin on the same board', () => {
  assert.equal(shouldFlushPendingPinDescription({ boardId: 'board-a', pinId: 'pin-a' }, 'board-a', 'pin-a'), false);
});

test('flushes when switching to another pin on the same board', () => {
  assert.equal(shouldFlushPendingPinDescription({ boardId: 'board-a', pinId: 'pin-a' }, 'board-a', 'pin-b'), true);
});

test('flushes when switching boards', () => {
  assert.equal(shouldFlushPendingPinDescription({ boardId: 'board-a', pinId: 'pin-a' }, 'board-b', 'pin-a'), true);
});
