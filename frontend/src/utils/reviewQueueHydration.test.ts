import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRestoredReviewQueue } from './reviewQueueHydration';

test('restores untouched server rows and preserves local edits made during hydration', () => {
  const rows = mergeRestoredReviewQueue(
    [{ id: 'existing', title: 'old server value' }, { id: 'untouched', title: 'server' }],
    [{ id: 'existing', title: 'locally edited' }, { id: 'new', title: 'locally added' }],
    new Set(['existing', 'new']),
  );
  assert.deepEqual(rows, [
    { id: 'untouched', title: 'server' },
    { id: 'existing', title: 'locally edited' },
    { id: 'new', title: 'locally added' },
  ]);
});

test('does not resurrect an item deleted locally while the server request was in flight', () => {
  const rows = mergeRestoredReviewQueue(
    [{ id: 'deleted', title: 'stale server row' }, { id: 'kept', title: 'server row' }],
    [{ id: 'kept', title: 'server row' }],
    new Set(['deleted']),
  );
  assert.deepEqual(rows, [{ id: 'kept', title: 'server row' }]);
});

test('does not duplicate rows when local and server versions share an ID', () => {
  const rows = mergeRestoredReviewQueue(
    [{ id: 'same', title: 'server' }],
    [{ id: 'same', title: 'local' }],
    new Set(['same']),
  );
  assert.deepEqual(rows, [{ id: 'same', title: 'local' }]);
});
