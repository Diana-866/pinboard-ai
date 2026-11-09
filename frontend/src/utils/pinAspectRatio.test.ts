import assert from 'node:assert/strict';
import test from 'node:test';
import { rollbackPinAspectRatioIfUnchanged } from './pinAspectRatio';

test('failed ratio save rolls back only the affected pin', () => {
  const pins = [
    { id: 'pin-1', aspectRatio: '9:16' },
    { id: 'pin-2', aspectRatio: '2:3' },
  ];
  assert.deepEqual(
    rollbackPinAspectRatioIfUnchanged(pins, 'pin-1', '9:16', '1:1'),
    [
      { id: 'pin-1', aspectRatio: '1:1' },
      { id: 'pin-2', aspectRatio: '2:3' },
    ],
  );
});

test('stale failed save does not overwrite a newer ratio choice', () => {
  const pins = [{ id: 'pin-1', aspectRatio: '4:5' }];
  assert.deepEqual(
    rollbackPinAspectRatioIfUnchanged(pins, 'pin-1', '9:16', '1:1'),
    pins,
  );
});

test('failed ratio save does not change another pin', () => {
  const pins = [
    { id: 'pin-1', aspectRatio: '9:16' },
    { id: 'pin-2', aspectRatio: '3:4' },
  ];
  assert.deepEqual(
    rollbackPinAspectRatioIfUnchanged(pins, 'pin-1', '9:16', '1:1'),
    [{ id: 'pin-1', aspectRatio: '1:1' }, pins[1]],
  );
});


test('two failed queued ratio choices return to the last server-confirmed ratio', () => {
  const originalServerRatio = '2:3';
  const optimisticAfterFirstChoice = [{ id: 'pin-1', aspectRatio: '9:16' }];
  const optimisticAfterSecondChoice = [{ id: 'pin-1', aspectRatio: '1:1' }];

  // The first failure must not roll back over the newer optimistic choice.
  assert.deepEqual(
    rollbackPinAspectRatioIfUnchanged(optimisticAfterSecondChoice, 'pin-1', '9:16', originalServerRatio),
    optimisticAfterSecondChoice,
  );
  // If the second request also fails, it must return to the server value,
  // not to the first choice which was never confirmed.
  assert.deepEqual(
    rollbackPinAspectRatioIfUnchanged(optimisticAfterSecondChoice, 'pin-1', '1:1', originalServerRatio),
    [{ id: 'pin-1', aspectRatio: originalServerRatio }],
  );
  assert.equal(optimisticAfterFirstChoice[0].aspectRatio, '9:16');
});
