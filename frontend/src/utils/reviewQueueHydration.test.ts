import assert from 'node:assert/strict';
import test from 'node:test';
import { isReviewQueuePayload, mergeRestoredReviewQueue } from './reviewQueueHydration';

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


test('accepts a valid empty review queue payload', () => {
  assert.equal(isReviewQueuePayload([]), true);
});

test('rejects malformed queue payloads instead of treating them as an empty queue', () => {
  assert.equal(isReviewQueuePayload(null), false);
  assert.equal(isReviewQueuePayload({ rows: [] }), false);
  assert.equal(isReviewQueuePayload([null]), false);
  assert.equal(isReviewQueuePayload([{}]), false);
  assert.equal(isReviewQueuePayload([{ id: '' }]), false);
  assert.equal(isReviewQueuePayload([{ id: 123 }]), false);
});
