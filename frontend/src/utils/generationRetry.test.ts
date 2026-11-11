import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationIdempotencyKey, isDefinitiveGenerationFailure, isGenerationInProgress, normalizeGenerationRecoveryStatus, countDurableGenerationPins } from './generationRetry';

test('rotates key after an explicitly definitive generation failure', () => {
  assert.equal(isDefinitiveGenerationFailure({
    data: { code: 'generation_request_failed' },
  }), true);
});

test('rotates key after an explicit preflight insufficient-credit rejection', () => {
  assert.equal(isDefinitiveGenerationFailure({
    data: { code: 'generation_insufficient_credits' },
  }), true);
});

test('does not rotate key for a post-provider insufficient-credit settlement failure', () => {
  assert.equal(isDefinitiveGenerationFailure({
    data: { code: 'generation_outcome_unknown' },
  }), false);
});

test('does not rotate key for an unknown provider outcome', () => {
  assert.equal(isDefinitiveGenerationFailure({
    data: { code: 'generation_outcome_unknown' },
  }), false);
});

test('does not rotate key while generation is still processing', () => {
  assert.equal(isDefinitiveGenerationFailure({
    data: { code: 'generation_in_progress' },
  }), false);
});

test('does not rotate key for unrelated or malformed errors', () => {
  assert.equal(isDefinitiveGenerationFailure(new Error('network failure')), false);
  assert.equal(isDefinitiveGenerationFailure({ data: null }), false);
  assert.equal(isDefinitiveGenerationFailure(null), false);
});

test('uses secure random bytes when randomUUID is unavailable', () => {
  const key = createGenerationIdempotencyKey({
    getRandomValues: (bytes: Uint8Array) => {
      bytes.forEach((_, index) => { bytes[index] = index; });
      return bytes;
    },
  } as unknown as Crypto);
  assert.equal(key, '000102030405060708090a0b0c0d0e0f');
});

test('prefers randomUUID when the browser supports it', () => {
  const key = createGenerationIdempotencyKey({
    randomUUID: () => '12345678-1234-1234-1234-123456789abc',
    getRandomValues: () => { throw new Error('should not be called'); },
  } as unknown as Crypto);
  assert.equal(key, '12345678_1234_1234_1234_123456789abc');
});

test('fails closed when secure browser randomness is unavailable', () => {
  assert.throws(
    () => createGenerationIdempotencyKey({} as unknown as Crypto),
    /HTTPS/,
  );
});

test('recognizes the backend 409 in-progress generation response without treating it as definitive failure', () => {
  const error = { status: 409, data: { code: 'generation_in_progress' } };
  assert.equal(isGenerationInProgress(error), true);
  assert.equal(isDefinitiveGenerationFailure(error), false);
});

test('does not classify unknown or unrelated errors as in-progress', () => {
  assert.equal(isGenerationInProgress({ status: 409, data: { code: 'generation_outcome_unknown' } }), false);
  assert.equal(isGenerationInProgress(new Error('network failure')), false);
});


test('accepts completed recovery only when at least one saved pin is present', () => {
  const savedPin = { id: 'pin-1', image_url: 'https://storage.example/pin-1.png' };
  assert.equal(normalizeGenerationRecoveryStatus('completed', [savedPin]), 'completed');
  assert.equal(normalizeGenerationRecoveryStatus('completed', []), 'unknown');
  assert.equal(normalizeGenerationRecoveryStatus('completed', null), 'unknown');
  assert.equal(normalizeGenerationRecoveryStatus('unexpected', [savedPin]), 'unknown');
});

test('preserves non-completed recovery states', () => {
  assert.equal(normalizeGenerationRecoveryStatus('processing', []), 'processing');
  assert.equal(normalizeGenerationRecoveryStatus('failed', []), 'failed');
  assert.equal(normalizeGenerationRecoveryStatus('unknown', []), 'unknown');
});


test('counts only persisted pins with an identity and an HTTP image URL', () => {
  assert.equal(countDurableGenerationPins([
    { id: 'pin-1', image_url: 'https://storage.example/pin-1.png' },
    { id: '', image_url: 'https://storage.example/pin-2.png' },
    { id: 'pin-3', image_url: '' },
    { id: 'pin-4', image_url: 'javascript:alert(1)' },
    null,
  ]), 1);
  assert.equal(countDurableGenerationPins(null), 0);
});
