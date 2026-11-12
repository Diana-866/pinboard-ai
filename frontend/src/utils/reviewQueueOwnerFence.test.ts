import assert from 'node:assert/strict';
import test from 'node:test';
import { isReviewQueueItemCurrent, isReviewQueueItemPresent, isReviewQueueOwnerCurrent } from './reviewQueueOwnerFence';

test('accepts work owned by the current authenticated session', () => {
  const snapshot = { userId: 'user-a', generation: 4 };
  assert.equal(isReviewQueueOwnerCurrent(snapshot, snapshot), true);
});

test('rejects queued work after switching to another account', () => {
  assert.equal(
    isReviewQueueOwnerCurrent(
      { userId: 'user-a', generation: 4 },
      { userId: 'user-b', generation: 5 },
    ),
    false,
  );
});

test('rejects stale work after switching away and back to the same account', () => {
  assert.equal(
    isReviewQueueOwnerCurrent(
      { userId: 'user-a', generation: 4 },
      { userId: 'user-a', generation: 6 },
    ),
    false,
  );
});

test('rejects work after sign-out even if the old user signs in again', () => {
  assert.equal(
    isReviewQueueOwnerCurrent(
      { userId: 'user-a', generation: 4 },
      { userId: 'user-a', generation: 7 },
    ),
    false,
  );
});

test('rejects snapshots without an authenticated owner', () => {
  assert.equal(
    isReviewQueueOwnerCurrent(
      { userId: '', generation: 4 },
      { userId: '', generation: 4 },
    ),
    false,
  );
});


test('rejects stale edits when the active review card changes', () => {
  assert.equal(isReviewQueueItemCurrent({ id: 'row-a', pinId: 'pin-a' }, { id: 'row-a', pinId: 'pin-a' }), true);
  assert.equal(isReviewQueueItemCurrent({ id: 'row-a', pinId: 'pin-a' }, { id: 'row-b', pinId: 'pin-b' }), false);
  assert.equal(isReviewQueueItemCurrent({ id: 'row-a', pinId: 'pin-a' }, { id: 'row-a', pinId: 'pin-b' }), false);
  assert.equal(isReviewQueueItemCurrent({ id: 'row-a', pinId: '' }, null), false);
});


test('bulk work remains valid only while the exact persisted card is still queued', () => {
  const expected = { id: 'row-a', pinId: 'pin-a' };
  assert.equal(isReviewQueueItemPresent(expected, [expected, { id: 'row-b', pinId: 'pin-b' }]), true);
  assert.equal(isReviewQueueItemPresent(expected, [{ id: 'row-a', pinId: 'pin-b' }]), false);
  assert.equal(isReviewQueueItemPresent(expected, [{ id: 'row-b', pinId: 'pin-a' }]), false);
  assert.equal(isReviewQueueItemPresent(expected, []), false);
});
