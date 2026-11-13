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


test('a queued save runs after an earlier in-flight save fails', async () => {
  const queue = new Map<string, Promise<unknown>>();
  const failure = new Error('first write failed');
  let rejectFirst!: (error: Error) => void;
  const calls: string[] = [];

  const first = enqueuePinSave(queue, 'pin-1', () => new Promise<void>((_resolve, reject) => {
    calls.push('first-started');
    rejectFirst = reject;
  }));
  const second = enqueuePinSave(queue, 'pin-1', async () => {
    calls.push('second-started');
    return 'saved';
  });

  assert.deepEqual(calls, ['first-started']);
  rejectFirst(failure);
  await assert.rejects(first, failure);
  assert.equal(await second, 'saved');
  assert.deepEqual(calls, ['first-started', 'second-started']);
  assert.equal(queue.has('pin-1'), false);
});

test('different pins start saving concurrently while requests are pending', async () => {
  const queue = new Map<string, Promise<unknown>>();
  const calls: string[] = [];
  let finishFirst!: () => void;
  let finishSecond!: () => void;

  const first = enqueuePinSave(queue, 'pin-1', () => new Promise<void>((resolve) => {
    calls.push('pin-1-started');
    finishFirst = resolve;
  }));
  const second = enqueuePinSave(queue, 'pin-2', () => new Promise<void>((resolve) => {
    calls.push('pin-2-started');
    finishSecond = resolve;
  }));

  assert.deepEqual(calls, ['pin-1-started', 'pin-2-started']);
  finishFirst();
  finishSecond();
  await Promise.all([first, second]);
});
