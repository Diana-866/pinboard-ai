import test from 'node:test';
import assert from 'node:assert/strict';
import { isExpiredGenerationRecoveryError } from './generationRecovery';

test('recognizes HTTP 410 from ApiError', () => {
  assert.equal(isExpiredGenerationRecoveryError({ status: 410 }), true);
});

test('recognizes the structured expired-result API code', () => {
  assert.equal(isExpiredGenerationRecoveryError({
    status: 400,
    data: { code: 'idempotency_result_expired' },
  }), true);
});

test('does not classify transient, unauthorized, or unrelated errors as expired', () => {
  assert.equal(isExpiredGenerationRecoveryError({ status: 0 }), false);
  assert.equal(isExpiredGenerationRecoveryError({ status: 401 }), false);
  assert.equal(isExpiredGenerationRecoveryError({ status: 500 }), false);
  assert.equal(isExpiredGenerationRecoveryError({ data: { code: 'generation_in_progress' } }), false);
  assert.equal(isExpiredGenerationRecoveryError(null), false);
  assert.equal(isExpiredGenerationRecoveryError(new Error('network failure')), false);
});
