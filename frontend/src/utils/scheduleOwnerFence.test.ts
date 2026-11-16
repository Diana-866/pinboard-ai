import assert from 'node:assert/strict';
import test from 'node:test';
import { isScheduleOwnerCurrent } from './scheduleOwnerFence';

test('accepts a completion only for the same non-empty authenticated owner', () => {
  assert.equal(isScheduleOwnerCurrent('user-a', 'user-a'), true);
});

test('rejects a completion after the authenticated owner changes', () => {
  assert.equal(isScheduleOwnerCurrent('user-b', 'user-a'), false);
});

test('does not authorize missing or empty identities', () => {
  assert.equal(isScheduleOwnerCurrent('', ''), false);
  assert.equal(isScheduleOwnerCurrent('user-a', ''), false);
  assert.equal(isScheduleOwnerCurrent(undefined, 'user-a'), false);
  assert.equal(isScheduleOwnerCurrent('user-a', undefined), false);
});
