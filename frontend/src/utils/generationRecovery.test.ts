import test from 'node:test';
import assert from 'node:assert/strict';
import { isExpiredGenerationRecoveryError } from './generationRecovery';

test('recognizes only the explicit HTTP 410 expiry response', () => {
  assert.equal(isExpiredGenerationRecoveryError({
    status: 410,
    data: { code: 'idempotency_result_expired' },
  }), true);
});

test('does not rotate the key when the expiry code arrives with another status', () => {
  assert.equal(isExpiredGenerationRecoveryError({
    status: 400,
    data: { code: 'idempotency_result_expired' },
  }), false);
  assert.equal(isExpiredGenerationRecoveryError({
    status: 409,
    data: { code: 'idempotency_result_expired' },
  }), false);
});

test('does not classify HTTP 410 with an unrelated or missing code as expiry', () => {
  assert.equal(isExpiredGenerationRecoveryError({ status: 410 }), false);
  assert.equal(isExpiredGenerationRecoveryError({
    status: 410,
    data: { code: 'generation_in_progress' },
  }), false);
});

test('does not classify transient, unauthorized, or unrelated errors as expired', () => {
  assert.equal(isExpiredGenerationRecoveryError({ status: 0 }), false);
  assert.equal(isExpiredGenerationRecoveryError({ status: 401 }), false);
  assert.equal(isExpiredGenerationRecoveryError({ status: 500 }), false);
  assert.equal(isExpiredGenerationRecoveryError({ data: { code: 'generation_in_progress' } }), false);
  assert.equal(isExpiredGenerationRecoveryError(null), false);
  assert.equal(isExpiredGenerationRecoveryError(new Error('network failure')), false);
});

import { shouldPollGenerationRecovery } from './generationRecovery';

test('polls while at least one generation is processing or unresolved', () => {
  assert.equal(shouldPollGenerationRecovery([{ status: 'processing' }]), true);
  assert.equal(shouldPollGenerationRecovery([{ status: 'unknown' }]), true);
  assert.equal(shouldPollGenerationRecovery([
    { status: 'completed' },
    { status: 'processing' },
  ]), true);
});

test('stops polling when all generations are terminal or absent', () => {
  assert.equal(shouldPollGenerationRecovery([{ status: 'completed' }]), false);
  assert.equal(shouldPollGenerationRecovery([{ status: 'failed' }]), false);
  assert.equal(shouldPollGenerationRecovery([{ status: 'expired' }]), false);
  assert.equal(shouldPollGenerationRecovery([]), false);
});


test('pauses automatic polling after an authentication failure but keeps recoverable requests available', () => {
  const unresolved = [{ status: 'processing' }];
  assert.equal(shouldPollGenerationRecovery(unresolved, true), false);
  assert.equal(shouldPollGenerationRecovery(unresolved, false), true);
});

import { buildUnknownGenerationRecoveryEntries } from './generationRecovery';

test('keeps all local recovery identities visible when status checks return 401', () => {
  const identities = [
    { fingerprint: 'request-a' },
    { fingerprint: 'request-b' },
  ];
  assert.deepEqual(buildUnknownGenerationRecoveryEntries(identities, 1), [
    { key: 'request-b', status: 'unknown', boardId: '', pinCount: 0 },
  ]);
});
