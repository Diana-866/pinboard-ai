import test from 'node:test';
import assert from 'node:assert/strict';
import { runBatchWithPartialFailures } from './batchPinReview';

test('runs review batch sequentially and reports progress for every pin', async () => {
  const calls: number[] = [];
  const progress: Array<{ completed: number; total: number; succeeded: number; failed: number }> = [];
  const result = await runBatchWithPartialFailures([1, 2, 3], async (pin) => {
    calls.push(pin);
    if (pin === 2) throw new Error('one pin failed');
  }, (value) => progress.push(value));

  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(result.succeeded, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].item, 2);
  assert.deepEqual(progress.map((value) => value.completed), [1, 2, 3]);
  assert.deepEqual(progress[2], { completed: 3, total: 3, succeeded: 2, failed: 1 });
});

test('returns an empty successful result for an empty batch', async () => {
  assert.deepEqual(await runBatchWithPartialFailures([], async () => {}), { succeeded: 0, failures: [] });
});
