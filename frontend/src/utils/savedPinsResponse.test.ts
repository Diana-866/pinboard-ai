import test from 'node:test';
import assert from 'node:assert/strict';
import { requireSavedPinsArray } from './savedPinsResponse';
import { getAppErrorMessage } from '../i18n/appErrorCopy';

test('accepts valid saved-pin records, including a genuinely empty board', () => {
  assert.deepEqual(requireSavedPinsArray([]), []);
  const pins = [{ id: 'pin-1', image_url: 'https://storage.example/pin.png' }];
  assert.deepEqual(requireSavedPinsArray(pins), pins);
});

test('rejects null instead of treating an API failure as an empty board', () => {
  assert.throws(() => requireSavedPinsArray(null), { message: getAppErrorMessage('savedPinsInvalidList') });
});

test('rejects object and string payloads instead of hiding saved pins', () => {
  assert.throws(() => requireSavedPinsArray({ data: [] }), { message: getAppErrorMessage('savedPinsInvalidList') });
  assert.throws(() => requireSavedPinsArray('[]'), { message: getAppErrorMessage('savedPinsInvalidList') });
});

test('rejects malformed records and missing pin identities', () => {
  assert.throws(() => requireSavedPinsArray([null]), { message: getAppErrorMessage('savedPinsInvalidRecord') });
  assert.throws(() => requireSavedPinsArray([{ image_url: 'https://storage.example/pin.png' }]), { message: getAppErrorMessage('savedPinMissingId') });
  assert.throws(() => requireSavedPinsArray([{ id: ' ', image_url: 'https://storage.example/pin.png' }]), { message: getAppErrorMessage('savedPinMissingId') });
});

test('rejects duplicate IDs instead of rendering ambiguous pin cards', () => {
  const duplicate = [
    { id: 'pin-1', image_url: 'https://storage.example/one.png' },
    { id: 'pin-1', image_url: 'https://storage.example/two.png' },
  ];
  assert.throws(() => requireSavedPinsArray(duplicate), { message: getAppErrorMessage('savedPinDuplicateId') });
});

test('rejects missing, malformed, or non-HTTPS image URLs', () => {
  assert.throws(() => requireSavedPinsArray([{ id: 'pin-1' }]), { message: getAppErrorMessage('savedPinMissingImage') });
  assert.throws(() => requireSavedPinsArray([{ id: 'pin-1', image_url: 'not-a-url' }]), { message: getAppErrorMessage('savedPinInvalidImage') });
  assert.throws(() => requireSavedPinsArray([{ id: 'pin-1', image_url: 'http://storage.example/pin.png' }]), { message: getAppErrorMessage('imageMustUseHttps') });
});
