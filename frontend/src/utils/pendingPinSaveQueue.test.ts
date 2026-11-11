import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueuePinSave } from './pendingPinSaveQueue';

test('serializes saves for the same pin in enqueue order', async () => {
  const queue = new Map<string, Promise<unknown>>();
  const calls: string[] = [];
  let releaseFirst!: () => void;
  const first = enqueuePinSave(queue, 'pin-1', () => new Promise<void>((resolve) => {
    calls.push('first-started');
    releaseFirst = () => { calls.push('first-finished'); resolve(); };
  }));
  const second = enqueuePinSave(queue, 'pin-1', async () => {
    calls.push('second-started');
    return 'saved';
  });

  assert.deepEqual(calls, ['first-started']);
  releaseFirst();
  await first;
  assert.equal(await second, 'saved');
  assert.deepEqual(calls, ['first-started', 'first-finished', 'second-started']);
  assert.equal(queue.has('pin-1'), false);
});

test('a failed save does not block the next save for that pin', async () => {
  const queue = new Map<string, Promise<unknown>>();
  const failure = new Error('network unavailable');
  const first = enqueuePinSave(queue, 'pin-1', async () => { throw failure; });
  await assert.rejects(first, failure);

  const second = enqueuePinSave(queue, 'pin-1', async () => 'recovered');
  assert.equal(await second, 'recovered');
  assert.equal(queue.has('pin-1'), false);
});

test('different pins can save independently', async () => {
  const queue = new Map<string, Promise<unknown>>();
  const calls: string[] = [];
  const first = enqueuePinSave(queue, 'pin-1', async () => { calls.push('pin-1'); });
  const second = enqueuePinSave(queue, 'pin-2', async () => { calls.push('pin-2'); });

  await Promise.all([first, second]);
  assert.deepEqual(calls.sort(), ['pin-1', 'pin-2']);
});
