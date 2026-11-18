import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPublicationSummary, isEmptySummary } from './analyticsSummary';

const valid = {
  range_days: 30,
  generated_at: '2026-11-18T12:00:00.000Z',
  publications: { total: 12, window: 4 },
  schedules: {
    scheduled_upcoming: 3,
    publishing: 1,
    failed_window: 2,
    cancelled_window: 0,
  },
  last_published_at: '2026-11-17T06:30:00.000Z',
  pinterest_metrics: { available: false, reason: 'not_collected' },
};

test('maps the backend summary into view-ready values', () => {
  const summary = mapPublicationSummary(valid);
  assert.equal(summary.rangeDays, 30);
  assert.deepEqual(summary.publications, { total: 12, window: 4 });
  assert.deepEqual(summary.schedules, {
    scheduledUpcoming: 3,
    publishing: 1,
    failedWindow: 2,
    cancelledWindow: 0,
  });
  assert.equal(summary.lastPublishedAt, '2026-11-17T06:30:00.000Z');
  assert.deepEqual(summary.pinterestMetrics, { available: false, reason: 'not_collected' });
  assert.equal(isEmptySummary(summary), false);
});

test('treats a missing last publication as null, not as an epoch date', () => {
  const summary = mapPublicationSummary({ ...valid, last_published_at: null });
  assert.equal(summary.lastPublishedAt, null);
});

test('an account with no activity is recognised as empty', () => {
  const summary = mapPublicationSummary({
    ...valid,
    publications: { total: 0, window: 0 },
    schedules: { scheduled_upcoming: 0, publishing: 0, failed_window: 0, cancelled_window: 0 },
    last_published_at: null,
  });
  assert.equal(isEmptySummary(summary), true);
});

test('a malformed payload throws instead of rendering zeros', () => {
  const cases: unknown[] = [
    null,
    undefined,
    'summary',
    [],
    {},
    { ...valid, range_days: 0 },
    { ...valid, range_days: 400 },
    { ...valid, range_days: '30' },
    { ...valid, publications: null },
    { ...valid, publications: { total: -1, window: 0 } },
    { ...valid, publications: { total: 1.5, window: 0 } },
    { ...valid, schedules: { scheduled_upcoming: 0 } },
    { ...valid, schedules: { ...valid.schedules, publishing: '1' } },
    { ...valid, last_published_at: 'yesterday' },
    { ...valid, pinterest_metrics: null },
    { ...valid, pinterest_metrics: { available: 'no' } },
  ];
  for (const payload of cases) {
    assert.throws(
      () => mapPublicationSummary(payload),
      (error) => error instanceof Error && error.message.startsWith('analytics'),
      `payload should be rejected: ${JSON.stringify(payload)}`
    );
  }
});

test('an unavailable Pinterest metrics reason is preserved but blank values are dropped', () => {
  assert.equal(mapPublicationSummary({ ...valid, pinterest_metrics: { available: false } }).pinterestMetrics.reason, null);
  assert.equal(
    mapPublicationSummary({ ...valid, pinterest_metrics: { available: false, reason: '   ' } }).pinterestMetrics.reason,
    null
  );
});
