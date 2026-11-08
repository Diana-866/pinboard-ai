import test from 'node:test';
import assert from 'node:assert/strict';
import { requireSavedPinsArray } from './savedPinsResponse';

test('accepts a valid saved-pins array, including a genuinely empty board', () => {
  assert.deepEqual(requireSavedPinsArray([]), []);
  const pins = [{ id: 'pin-1', image_url: 'https://storage.example/pin.png' }];
  assert.deepEqual(requireSavedPinsArray(pins), pins);
});

test('rejects null instead of treating an API failure as an empty board', () => {
  assert.throws(() => requireSavedPinsArray(null), /некорректный список/);
});

test('rejects object and string payloads instead of hiding saved pins', () => {
  assert.throws(() => requireSavedPinsArray({ data: [] }), /некорректный список/);
  assert.throws(() => requireSavedPinsArray('[]'), /некорректный список/);
});
