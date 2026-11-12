import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPublishSessionLock, isCurrentPublishSession, isCurrentPublishPin, ownsPublishSessionLock, type PublishSessionLock } from './publishSession';

test('publish responses are accepted only by the exact authenticated session', () => {
  assert.equal(isCurrentPublishSession('user-a', 1, 'user-a', 1), true);
  assert.equal(isCurrentPublishSession('user-b', 2, 'user-a', 1), false);
  assert.equal(isCurrentPublishSession('user-a', 3, 'user-a', 1), false);
  assert.equal(isCurrentPublishSession('', 4, '', 4), false);
});

test('an in-flight publish lock blocks only its exact owner session', () => {
  const lock: PublishSessionLock = { ownerId: 'user-a', sessionId: 7, requestId: 12 };
  assert.equal(hasPublishSessionLock(lock, 'user-a', 7), true);
  assert.equal(hasPublishSessionLock(lock, 'user-a', 8), false);
  assert.equal(hasPublishSessionLock(lock, 'user-b', 7), false);
  assert.equal(hasPublishSessionLock(null, 'user-a', 7), false);
  assert.equal(ownsPublishSessionLock(lock, 'user-a', 7, 12), true);
  assert.equal(ownsPublishSessionLock(lock, 'user-a', 7, 13), false);
  assert.equal(ownsPublishSessionLock(lock, 'user-a', 8, 12), false);
  assert.equal(ownsPublishSessionLock(null, 'user-a', 7, 12), false);
});

test('a stale completion cannot release a newer session lock', () => {
  const newerLock: PublishSessionLock = { ownerId: 'user-a', sessionId: 8, requestId: 13 };
  assert.equal(ownsPublishSessionLock(newerLock, 'user-a', 7, 12), false);
  assert.equal(ownsPublishSessionLock(newerLock, 'user-a', 8, 13), true);
});


test('a publish result belongs only to the exact pin generation', () => {
  assert.equal(isCurrentPublishPin('pin-a', 1, 'pin-a', 1), true);
  assert.equal(isCurrentPublishPin('pin-b', 2, 'pin-a', 1), false);
  assert.equal(isCurrentPublishPin('pin-a', 2, 'pin-a', 1), false);
  assert.equal(isCurrentPublishPin('', 2, '', 2), false);
});
