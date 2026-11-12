import test from 'node:test';
import assert from 'node:assert/strict';
import { requireSavedPinsArray } from './savedPinsResponse';

test('accepts valid saved-pin records, including a genuinely empty board', () => {
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

test('rejects malformed records and missing pin identities', () => {
  assert.throws(() => requireSavedPinsArray([null]), /некорректную запись/);
  assert.throws(() => requireSavedPinsArray([{ image_url: 'https://storage.example/pin.png' }]), /идентификатор/);
  assert.throws(() => requireSavedPinsArray([{ id: ' ', image_url: 'https://storage.example/pin.png' }]), /идентификатор/);
});

test('rejects duplicate IDs instead of rendering ambiguous pin cards', () => {
  const duplicate = [
    { id: 'pin-1', image_url: 'https://storage.example/one.png' },
    { id: 'pin-1', image_url: 'https://storage.example/two.png' },
  ];
  assert.throws(() => requireSavedPinsArray(duplicate), /повторяющийся идентификатор/);
});

test('rejects missing, malformed, or non-HTTPS image URLs', () => {
  assert.throws(() => requireSavedPinsArray([{ id: 'pin-1' }]), /отсутствует постоянная ссылка/);
  assert.throws(() => requireSavedPinsArray([{ id: 'pin-1', image_url: 'not-a-url' }]), /некорректную ссылку/);
  assert.throws(() => requireSavedPinsArray([{ id: 'pin-1', image_url: 'http://storage.example/pin.png' }]), /HTTPS/);
});


test('rejects whitespace-padded saved pin IDs', () => {
  assert.throws(() => requireSavedPinsArray([{
    id: ' pin-1 ',
    image_url: 'https://storage.example/pin.png',
  }]), /некорректен идентификатор/);
});

test('rejects saved image URLs with missing hosts or embedded credentials', () => {
  assert.throws(() => requireSavedPinsArray([{
    id: 'pin-1',
    image_url: 'https://',
  }]), /некорректную ссылку/);
  assert.throws(() => requireSavedPinsArray([{
    id: 'pin-1',
    image_url: 'https://user:password@storage.example/pin.png',
  }]), /безопасной HTTPS-ссылкой/);
});

test('rejects malformed saved-pin display fields before restoring the editor', () => {
  assert.throws(() => requireSavedPinsArray([{
    id: 'pin-1', title: { text: 'bad' }, image_url: 'https://storage.example/pin.png',
  }]), /некорректный заголовок/);
  assert.throws(() => requireSavedPinsArray([{
    id: 'pin-1', description: ['bad'], image_url: 'https://storage.example/pin.png',
  }]), /некорректное описание/);
});

test('rejects unsupported saved-pin aspect ratios', () => {
  assert.throws(() => requireSavedPinsArray([{
    id: 'pin-1', aspect_ratio: '16:9', image_url: 'https://storage.example/pin.png',
  }]), /неподдерживаемый формат/);
});
