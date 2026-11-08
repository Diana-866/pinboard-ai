import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPendingPinDescription,
  clearPendingPinDescriptionIfMatches,
  readPendingPinDescription,
  writePendingPinDescription,
} from './pendingPinDescription';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test('pending description survives a failed server save and can be restored', () => {
  const storage = memoryStorage();
  assert.equal(writePendingPinDescription('board-1', 'pin-1', 'Latest text', storage), true);
  assert.equal(readPendingPinDescription('board-1', 'pin-1', storage)?.description, 'Latest text');
});

test('pending descriptions are isolated by board and pin', () => {
  const storage = memoryStorage();
  writePendingPinDescription('board-1', 'pin-1', 'Board one', storage);
  writePendingPinDescription('board-2', 'pin-1', 'Board two', storage);
  assert.equal(readPendingPinDescription('board-1', 'pin-1', storage)?.description, 'Board one');
  assert.equal(readPendingPinDescription('board-2', 'pin-1', storage)?.description, 'Board two');
});

test('successful save cleanup removes only the matching local draft', () => {
  const storage = memoryStorage();
  writePendingPinDescription('board-1', 'pin-1', 'Draft one', storage);
  writePendingPinDescription('board-1', 'pin-2', 'Draft two', storage);
  clearPendingPinDescription('board-1', 'pin-1', storage);
  assert.equal(readPendingPinDescription('board-1', 'pin-1', storage), null);
  assert.equal(readPendingPinDescription('board-1', 'pin-2', storage)?.description, 'Draft two');
});

test('malformed stored data is ignored safely', () => {
  const storage = memoryStorage();
  storage.setItem('pinposy.pending-pin-description.v1:board%3A1:pin%3A1', '{broken');
  assert.equal(readPendingPinDescription('board:1', 'pin:1', storage), null);
});


test('an older successful save cannot clear a newer local draft', () => {
  const storage = memoryStorage();
  writePendingPinDescription('board-1', 'pin-1', 'First version', storage);
  writePendingPinDescription('board-1', 'pin-1', 'Newer version', storage);

  assert.equal(
    clearPendingPinDescriptionIfMatches('board-1', 'pin-1', 'First version', storage),
    false,
  );
  assert.equal(
    readPendingPinDescription('board-1', 'pin-1', storage)?.description,
    'Newer version',
  );
});

test('a successful save clears the matching recovery draft', () => {
  const storage = memoryStorage();
  writePendingPinDescription('board-1', 'pin-1', 'Saved version', storage);

  assert.equal(
    clearPendingPinDescriptionIfMatches('board-1', 'pin-1', 'Saved version', storage),
    true,
  );
  assert.equal(readPendingPinDescription('board-1', 'pin-1', storage), null);
});
