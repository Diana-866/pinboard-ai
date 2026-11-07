import test from 'node:test';
import assert from 'node:assert/strict';
import { isDefinitiveGenerationFailure } from './generationRetry';

test('rotates key after an explicitly definitive generation failure', () => {
  assert.equal(isDefinitiveGenerationFailure({
    data: { code: 'generation_request_failed' },
  }), true);
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
