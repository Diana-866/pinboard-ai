import assert from 'node:assert/strict';
import test from 'node:test';
import { rollbackPinAspectRatioIfUnchanged } from './pinAspectRatio';

test('failed ratio save rolls back only the affected pin', () => {
  const pins = [
    { id: 'pin-1', aspectRatio: '1:1' },
    { id: 'pin-2', aspectRatio: '2:3' },
  ];
  assert.deepEqual(
    rollbackPinAspectRatioIfUnchanged(pins, 'pin-1', '9:16', '1:1'),
    pins,
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
