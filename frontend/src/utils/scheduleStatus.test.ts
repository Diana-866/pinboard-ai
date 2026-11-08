import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePersistedScheduleStatus } from './scheduleStatus';

test('preserves every persisted publication status, including cancelled', () => {
  for (const status of ['scheduled', 'publishing', 'published', 'failed', 'unknown', 'cancelled']) {
    assert.equal(parsePersistedScheduleStatus(status), status);
  }
});

test('maps unknown or malformed API statuses to the safe unknown state', () => {
  for (const status of ['canceled', 'deleted', 'queued', '', null, undefined, 42]) {
    assert.equal(parsePersistedScheduleStatus(status), 'unknown');
  }
});
