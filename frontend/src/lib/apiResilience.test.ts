import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  MAX_RETRY_AFTER_SECONDS,
  MAX_TRANSPARENT_RETRY_SECONDS,
  REQUEST_TIMEOUT_MS,
  getRateLimitMessage,
  getRateLimitWait,
  getRetryAfterSeconds,
  isAbortError,
  shouldRetryTransparently,
} from './apiResilience';

/**
 * The request wrapper used to have only two outcomes: a response, or the generic
 * "something went wrong". Two real failures were therefore invisible to the user:
 * the global rate limit (429 — waiting fixes it) and a request that never settles
 * (no timeout at all, so the spinner stayed forever).
 */

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('Retry-After is read in delta-seconds form', () => {
  assert.equal(getRetryAfterSeconds('0'), 0);
  assert.equal(getRetryAfterSeconds('2'), 2);
  assert.equal(getRetryAfterSeconds(' 7 '), 7);
});

test('Retry-After is read in HTTP-date form', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  assert.equal(getRetryAfterSeconds('Wed, 18 Nov 2026 12:00:05 GMT', now), 5);
  // A date in the past must not produce a negative wait.
  assert.equal(getRetryAfterSeconds('Wed, 18 Nov 2026 11:59:00 GMT', now), 0);
});

test('an unusable header yields null instead of a guess', () => {
  for (const value of [null, undefined, '', '   ', 'soon', '-5', '1.5', 'NaN']) {
    assert.equal(getRetryAfterSeconds(value as any), null, `${String(value)} must not parse`);
  }
});

test('a hostile header cannot pin the client for long', () => {
  assert.equal(getRetryAfterSeconds('999999'), MAX_RETRY_AFTER_SECONDS);
  const now = Date.parse('2026-11-18T12:00:00Z');
  assert.equal(getRetryAfterSeconds('Thu, 18 Nov 2027 12:00:00 GMT', now), MAX_RETRY_AFTER_SECONDS);
});

test('short waits are retried once, long waits are reported, unknown waits are not guessed', () => {
  assert.equal(shouldRetryTransparently(2, 0), true);
  assert.equal(shouldRetryTransparently(MAX_TRANSPARENT_RETRY_SECONDS, 0), true);
  // The retry budget is exactly one attempt.
  assert.equal(shouldRetryTransparently(1, 1), false);
  // Longer than the transparent budget: the user is told instead of being blocked.
  assert.equal(shouldRetryTransparently(30, 0), false);
  // No header at all: sleeping for an unknown duration is worse than reporting.
  assert.equal(shouldRetryTransparently(null, 0), false);
  // A zero-wait retry would mean hammering the server in a loop.
  assert.equal(shouldRetryTransparently(0, 0), false);
});

test('the 429 message states the real number of seconds in the user language', () => {
  const english = getRateLimitMessage(12, 'en');
  const russian = getRateLimitMessage(12, 'ru');
  assert.match(english, /12/);
  assert.match(russian, /12/);
  assert.notEqual(english, russian);
  assert.doesNotMatch(english, /seconds|{seconds}/.test('') ? /x/ : /\{seconds\}/, 'placeholder must be substituted');
});

test('without a usable wait the 429 falls back to the generic message', () => {
  const generic = getRateLimitMessage(null, 'en');
  assert.doesNotMatch(generic, /\{seconds\}|null|undefined|NaN/);
  assert.equal(generic, getRateLimitMessage(Number.NaN, 'en'));
});

test('the wait comes from the body first, then Retry-After, then RateLimit-Reset', () => {
  const headers = (values: Record<string, string>) => ({
    get: (name: string) => values[name] ?? null,
  });
  const now = Date.parse('2026-11-18T12:00:00Z');

  // The backend states the wait in the body; that wins over any header.
  assert.equal(
    getRateLimitWait(headers({ 'Retry-After': '30' }), { retryAfterSeconds: 4 }, now),
    4
  );
  // A backend that only sets the standard header still works.
  assert.equal(getRateLimitWait(headers({ 'Retry-After': '9' }), {}, now), 9);
  // express-rate-limit's own header is the last resort, so a throttled request is never
  // reported as "wait an unknown amount of time".
  assert.equal(getRateLimitWait(headers({ 'RateLimit-Reset': '17' }), null, now), 17);
  // Unusable values degrade to null rather than to a bogus wait.
  assert.equal(getRateLimitWait(null, null, now), null);
  assert.equal(getRateLimitWait(headers({}), { retryAfterSeconds: 'soon' }, now), null);
  assert.equal(getRateLimitWait({ get: () => { throw new Error('boom'); } }, null, now), null);
  // A hostile body cannot pin the client.
  assert.equal(getRateLimitWait(null, { retryAfterSeconds: 99999 }, now), MAX_RETRY_AFTER_SECONDS);
});

test('the timeout is bounded and its abort is distinguishable from a network error', () => {
  assert.ok(REQUEST_TIMEOUT_MS >= 10_000 && REQUEST_TIMEOUT_MS <= 120_000, 'timeout must be sane');
  assert.equal(isAbortError({ name: 'AbortError' }), true);
  assert.equal(isAbortError({ name: 'TimeoutError' }), true);
  assert.equal(isAbortError({ name: 'TypeError' }), false);
  assert.equal(isAbortError(null), false);
  assert.equal(isAbortError('boom'), false);
});

test('the request wrapper actually uses the timeout, the 429 branch and the abort check', () => {
  const source = readFileSync(path.join(SRC, 'lib/api.ts'), 'utf8');
  assert.match(source, /REQUEST_TIMEOUT_MS/, 'timeout must be wired into the request');
  assert.match(source, /AbortController/);
  assert.match(source, /res\.status === 429/, 'a 429 must not fall through to the generic message');
  assert.match(source, /shouldRetryTransparently\(seconds, attempt\)/);
  assert.match(source, /getRateLimitWait\(res\.headers, data\)/, 'the 429 wait must be read from the response');
  assert.match(source, /isAbortError\(error\)/, 'a timeout must be reported as such');
  // The behaviour the earlier defect fix depends on must survive this rewrite.
  assert.match(source, /const isAuthAttempt = path === "\/login" \|\| path === "\/register"/);
});
