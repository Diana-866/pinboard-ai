import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLatestSelectedSchedulePin } from './resolveLatestSelectedSchedulePin';

test('uses the latest server row for an already-open calendar detail modal', () => {
  const selected = { id: 'schedule-1', status: 'publishing' };
  const refreshed = { id: 'schedule-1', status: 'published', pinterestPinUrl: 'https://www.pinterest.com/pin/123/' };
  assert.equal(resolveLatestSelectedSchedulePin(selected, [refreshed]), refreshed);
});

test('keeps the current selection when a refresh temporarily omits its row', () => {
  const selected = { id: 'schedule-1', status: 'publishing' };
  assert.equal(resolveLatestSelectedSchedulePin(selected, []), selected);
});

test('returns null when no detail modal is selected', () => {
  assert.equal(resolveLatestSelectedSchedulePin(null, [{ id: 'schedule-1' }]), null);
});
