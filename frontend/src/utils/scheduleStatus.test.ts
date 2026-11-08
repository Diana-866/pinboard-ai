import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePersistedScheduleStatus } from './scheduleStatus';

test('preserves every persisted publication status, including cancelled', () => {
  for (const status of ['scheduled', 'publishing', 'published', 'failed', 'unknown', 'cancelled']) {
    assert.equal(parsePersistedScheduleStatus(status), status);
  }
});

test('does not disguise unknown or malformed statuses as scheduled', () => {
  for (const status of ['canceled', 'deleted', 'queued', '', null, undefined, 42]) {
    assert.throws(() => parsePersistedScheduleStatus(status), /Unsupported persisted schedule status/);
  }
});
