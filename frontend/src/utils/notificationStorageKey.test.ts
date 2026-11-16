import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNotificationStorageKey } from './notificationStorageKey';

test('builds a stable notification key for an authenticated owner', () => {
  assert.equal(buildNotificationStorageKey('user-a'), 'pinposy_notifications:user-a');
});

test('keeps notification history separate between users', () => {
  assert.notEqual(buildNotificationStorageKey('user-a'), buildNotificationStorageKey('user-b'));
});

test('rejects empty notification owners', () => {
  assert.throws(() => buildNotificationStorageKey(''));
});
