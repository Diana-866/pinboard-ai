import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPublishSessionLock,
  isCurrentPublishOwner,
  ownsPublishSessionLock,
  type PublishSessionLock,
} from './publishSession';

test('publish responses are accepted only by the owner session that started them', () => {
  assert.equal(isCurrentPublishOwner('user-a', 'user-a'), true);
  assert.equal(isCurrentPublishOwner('user-b', 'user-a'), false);
  assert.equal(isCurrentPublishOwner('', ''), false);
});

test('an in-flight publish lock blocks only its own owner session', () => {
  const lock: PublishSessionLock = { ownerId: 'user-a', requestId: 12 };

  assert.equal(hasPublishSessionLock(lock, 'user-a'), true);
  assert.equal(hasPublishSessionLock(lock, 'user-b'), false);
  assert.equal(hasPublishSessionLock(null, 'user-a'), false);
  assert.equal(ownsPublishSessionLock(lock, 'user-a', 12), true);
  assert.equal(ownsPublishSessionLock(lock, 'user-a', 13), false);
  assert.equal(ownsPublishSessionLock(lock, 'user-b', 12), false);
  assert.equal(ownsPublishSessionLock(null, 'user-a', 12), false);
});

test('a stale publish completion cannot release a newer session lock', () => {
  const newerLock: PublishSessionLock = { ownerId: 'user-b', requestId: 13 };

  assert.equal(ownsPublishSessionLock(newerLock, 'user-a', 12), false);
  assert.equal(ownsPublishSessionLock(newerLock, 'user-b', 13), true);
});
