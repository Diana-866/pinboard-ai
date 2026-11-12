import test from 'node:test';
import assert from 'node:assert/strict';
import { requireGeneratedPinsArray } from './generatedPinsResponse';

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
  assert.throws(() => requireGeneratedPinsArray([]), /некорректный результат/);
  assert.throws(() => requireGeneratedPinsArray({ pins: [] }), /некорректный результат/);
  assert.throws(() => requireGeneratedPinsArray(Array.from({ length: 11 }, (_, i) => ({
    id: `pin-${i}`, image_url: 'https://storage.example/pin.png',
  }))), /некорректный результат/);
});

test('rejects a pin without a stable id or permanent image URL', () => {
  assert.throws(() => requireGeneratedPinsArray([{ image_url: 'https://storage.example/pin.png' }]), /идентификатор/);
  assert.throws(() => requireGeneratedPinsArray([{ id: 'pin-1' }]), /постоянная ссылка/);
});

test('rejects malformed and non-HTTPS image URLs', () => {
  assert.throws(() => requireGeneratedPinsArray([{ id: 'pin-1', image_url: 'not-a-url' }]), /некорректную ссылку/);
  assert.throws(() => requireGeneratedPinsArray([{ id: 'pin-1', image_url: 'http://storage.example/pin.png' }]), /HTTPS/);
});

test('rejects null entries and nested arrays', () => {
  assert.throws(() => requireGeneratedPinsArray([null]), /неполные данные/);
  assert.throws(() => requireGeneratedPinsArray([[{ id: 'pin-1', image_url: 'https://storage.example/pin.png' }]]), /неполные данные/);
});

test('rejects duplicate pin IDs so separate saved results cannot overwrite each other in the UI', () => {
  const duplicate = [
    { id: 'pin-1', image_url: 'https://storage.example/one.png' },
    { id: 'pin-1', image_url: 'https://storage.example/two.png' },
  ];
  assert.throws(() => requireGeneratedPinsArray(duplicate), /повторяющийся идентификатор/);
});


test('rejects whitespace-padded pin IDs instead of accepting ambiguous identities', () => {
  assert.throws(() => requireGeneratedPinsArray([{
    id: ' pin-1 ',
    image_url: 'https://storage.example/pin.png',
  }]), /некорректен идентификатор/);
});

test('rejects HTTPS image URLs containing embedded credentials', () => {
  assert.throws(() => requireGeneratedPinsArray([{
    id: 'pin-1',
    image_url: 'https://user:password@storage.example/pin.png',
  }]), /безопасной HTTPS-ссылкой/);
});

test('rejects non-string display fields that could crash the pin editor', () => {
  assert.throws(() => requireGeneratedPinsArray([{
    id: 'pin-1', title: { text: 'bad' }, image_url: 'https://storage.example/pin.png',
  }]), /некорректный заголовок/);
  assert.throws(() => requireGeneratedPinsArray([{
    id: 'pin-1', description: ['bad'], image_url: 'https://storage.example/pin.png',
  }]), /некорректное описание/);
});

test('rejects unsupported aspect ratios before rendering generated pins', () => {
  assert.throws(() => requireGeneratedPinsArray([{
    id: 'pin-1', aspect_ratio: '16:9', image_url: 'https://storage.example/pin.png',
  }]), /неподдерживаемый формат/);
});
