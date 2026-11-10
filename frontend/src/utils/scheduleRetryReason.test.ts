import test from 'node:test';
import assert from 'node:assert/strict';
import { getScheduleRetryReasonMessage } from './scheduleRetryReason';

test('maps known server retryability reasons to safe user-facing messages', () => {
  assert.match(getScheduleRetryReasonMessage('account_unavailable', 'ru'), /аккаунт/);
  assert.match(getScheduleRetryReasonMessage('publication_exists', 'en'), /already registered/);
  assert.match(getScheduleRetryReasonMessage('metadata_unavailable', 'de'), /Veröffentlichungsprotokoll/);
});

test('does not expose unknown server strings to the user', () => {
  const message = getScheduleRetryReasonMessage('provider-secret-token-123', 'ru');
  assert.match(message, /Безопасный повтор не подтверждён/);
  assert.doesNotMatch(message, /provider-secret-token/);
});

test('falls back safely for missing reasons and unsupported languages', () => {
  assert.match(getScheduleRetryReasonMessage(null, 'ru'), /Безопасный повтор/);
  assert.match(getScheduleRetryReasonMessage('account_unavailable', 'it'), /Pinterest account/);
});
