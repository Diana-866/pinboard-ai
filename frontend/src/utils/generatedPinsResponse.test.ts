import test from 'node:test';
import assert from 'node:assert/strict';
import { requireGeneratedPinsArray } from './generatedPinsResponse';
import { getAppErrorMessage } from '../i18n/appErrorCopy';

test('accepts a complete persisted generation response', () => {
  const rows = [{
    id: 'pin-1',
    title: 'A saved pin',
    description: 'Description',
    image_url: 'https://storage.example/pin.png',
    aspect_ratio: '2:3',
  }];
  assert.deepEqual(requireGeneratedPinsArray(rows), rows);
});

test('rejects empty, non-array, and oversized generation responses', () => {
  assert.throws(() => requireGeneratedPinsArray([]), { message: getAppErrorMessage('generationInvalidResult') });
  assert.throws(() => requireGeneratedPinsArray({ pins: [] }), { message: getAppErrorMessage('generationInvalidResult') });
  assert.throws(() => requireGeneratedPinsArray(Array.from({ length: 11 }, (_, i) => ({
    id: `pin-${i}`, image_url: 'https://storage.example/pin.png',
  }))), { message: getAppErrorMessage('generationInvalidResult') });
});

test('rejects a pin without a stable id or permanent image URL', () => {
  assert.throws(() => requireGeneratedPinsArray([{ image_url: 'https://storage.example/pin.png' }]), { message: getAppErrorMessage('generationPinMissingId') });
  assert.throws(() => requireGeneratedPinsArray([{ id: 'pin-1' }]), { message: getAppErrorMessage('generationMissingImage') });
});

test('rejects malformed and non-HTTPS image URLs', () => {
  assert.throws(() => requireGeneratedPinsArray([{ id: 'pin-1', image_url: 'not-a-url' }]), { message: getAppErrorMessage('generationInvalidImage') });
  assert.throws(() => requireGeneratedPinsArray([{ id: 'pin-1', image_url: 'http://storage.example/pin.png' }]), { message: getAppErrorMessage('generationUnsafeImage') });
});

test('rejects null entries and nested arrays', () => {
  assert.throws(() => requireGeneratedPinsArray([null]), { message: getAppErrorMessage('generationIncompletePin') });
  assert.throws(() => requireGeneratedPinsArray([[{ id: 'pin-1', image_url: 'https://storage.example/pin.png' }]]), { message: getAppErrorMessage('generationIncompletePin') });
});

test('rejects duplicate pin IDs so separate saved results cannot overwrite each other in the UI', () => {
  const duplicate = [
    { id: 'pin-1', image_url: 'https://storage.example/one.png' },
    { id: 'pin-1', image_url: 'https://storage.example/two.png' },
  ];
  assert.throws(() => requireGeneratedPinsArray(duplicate), { message: getAppErrorMessage('generationDuplicateId') });
});


test('rejects whitespace-padded pin IDs instead of accepting ambiguous identities', () => {
  assert.throws(() => requireGeneratedPinsArray([{
    id: ' pin-1 ',
    image_url: 'https://storage.example/pin.png',
  }]), { message: getAppErrorMessage('generationPinMissingId') });
});

test('rejects HTTPS image URLs containing embedded credentials', () => {
  assert.throws(() => requireGeneratedPinsArray([{
    id: 'pin-1',
    image_url: 'https://user:password@storage.example/pin.png',
  }]), { message: getAppErrorMessage('generationUnsafeImage') });
});
