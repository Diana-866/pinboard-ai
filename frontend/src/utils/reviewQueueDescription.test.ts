import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReviewQueueDescription } from './reviewQueueDescription';

test('review queue uses the exact description flushed before enqueue', () => {
  assert.equal(
    resolveReviewQueueDescription('stale React render', 'latest persisted text'),
    'latest persisted text',
  );
});

test('review queue keeps the current description when no recovery flush was needed', () => {
  assert.equal(resolveReviewQueueDescription('current text', null), 'current text');
  assert.equal(resolveReviewQueueDescription('current text', undefined), 'current text');
});

test('review queue preserves an intentionally cleared description', () => {
  assert.equal(resolveReviewQueueDescription('old text', ''), '');
});
