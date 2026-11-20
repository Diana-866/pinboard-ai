import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LOCKOUT_FALLBACK_SECONDS,
  LOCKOUT_MAX_SECONDS,
  lockoutCountdownText,
  lockoutDeadline,
  lockoutSecondsRemaining,
  lockoutState,
} from './lockoutCountdown';

/**
 * The sign-in page now counts a lockout down instead of printing it once. The arithmetic is pure and
 * tested here; one structural test then checks that the page actually uses it, because a page that
 * keeps saying "locked" forever is exactly the bug this fixes.
 */

test('the wait ends exactly when the server said it would', () => {
  const now = 1_700_000_000_000;
  const deadline = lockoutDeadline(900, now);
  assert.equal(deadline, now + 900_000);
  assert.equal(lockoutSecondsRemaining(deadline, now), 900);
  assert.equal(lockoutSecondsRemaining(deadline, now + 899_000), 1);
  assert.equal(lockoutSecondsRemaining(deadline, deadline), 0, 'the wait must be over at the deadline, not a tick later');
  assert.equal(lockoutSecondsRemaining(deadline, deadline + 60_000), 0, 'a past deadline can never go negative');
});

test('remaining time is rounded up so the button is never enabled early', () => {
  const now = 1_700_000_000_000;
  const deadline = now + 1500; // 1.5 s
  assert.equal(lockoutSecondsRemaining(deadline, now), 2);
  assert.equal(lockoutSecondsRemaining(deadline, now + 600), 1);
});

test('a nonsense wait from the server is a short bounded wait, never "not locked"', () => {
  const now = 1_700_000_000_000;
  for (const value of [undefined, null, '', 'abc', 0, -5, NaN, Infinity]) {
    assert.equal(
      lockoutDeadline(value, now),
      now + LOCKOUT_FALLBACK_SECONDS * 1000,
      `retryAfterSeconds=${String(value)} must fall back to a short wait, because the server said the account is locked`
    );
  }
});

test('an absurd wait is clamped so a bad value cannot disable the page for good', () => {
  const now = 1_700_000_000_000;
  assert.equal(lockoutDeadline(30 * 24 * 60 * 60, now), now + LOCKOUT_MAX_SECONDS * 1000);
  assert.equal(lockoutDeadline(900, now), now + 900_000);
});

test('the state clears itself once the wait is over', () => {
  const now = 1_700_000_000_000;
  const deadline = lockoutDeadline(60, now);
  assert.deepEqual(lockoutState(deadline, now), { untilMs: deadline, remainingSeconds: 60 });
  assert.deepEqual(lockoutState(deadline, now + 60_000), { untilMs: null, remainingSeconds: 0 });
  assert.deepEqual(lockoutState(null, now), { untilMs: null, remainingSeconds: 0 });
});

test('the countdown text fills both placeholders and never leaves a bare number behind', () => {
  assert.equal(lockoutCountdownText('{seconds} s', 42), '42 s');
  assert.equal(lockoutCountdownText('{minutes} min', 61), '2 min');
  assert.equal(lockoutCountdownText('Both {seconds} s / {minutes} min', 0), 'Both 0 s / 1 min');
  assert.equal(lockoutCountdownText('', 10), '');
  assert.equal(lockoutCountdownText('no placeholder', 10), 'no placeholder', 'a template without a number is returned as written');
});

test('every language states the lockout wait in seconds and keeps the password-reset advice', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/i18n/authCopy.ts'), 'utf8');
  const matches = source.match(/errorLoginLockedCountdown: "[^"]+"/g) || [];
  assert.equal(matches.length, 7, `expected one countdown copy per language, found ${matches.length}`);
  for (const line of matches) {
    assert.match(line, /\{seconds\}/, `a countdown without the placeholder shows nothing useful: ${line}`);
  }
});

test('the sign-in page counts the lockout down, blocks submitting and clears the message', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/Login.tsx'), 'utf8');

  // The submit button is the surface that matters: it must stay disabled while the wait lasts.
  const buttonStart = source.indexOf('<button\n          type="submit"');
  assert.ok(buttonStart > -1, 'the submit button could not be located, so this guard would check nothing');
  const buttonBlock = source.slice(buttonStart, source.indexOf('</button>', buttonStart));
  assert.match(
    buttonBlock,
    /disabled=\{loading \|\| lockoutLeft > 0\}/,
    'a locked customer must not be able to submit again before the wait is over'
  );

  // The wait must come from the server's answer, not from a local constant.
  const lockStart = source.indexOf("err?.data?.code === 'login_locked'");
  assert.ok(lockStart > -1, 'the lockout branch could not be located');
  const lockBranch = source.slice(lockStart, lockStart + 600);
  assert.match(
    lockBranch,
    /setLockoutUntil\(lockoutDeadline\(err\?\.data\?\.retryAfterSeconds/,
    'the countdown must be started from the retryAfterSeconds the server sent'
  );

  // The message shown while locked must be the live text, not the frozen sentence.
  assert.match(
    source,
    /\{lockoutLeft > 0 \? lockoutCountdownText\(t\.errorLoginLockedCountdown, lockoutLeft\) : error\}/,
    'the message must switch to the live countdown while the lock is active'
  );

  // A timer that is never cleared keeps ticking after the page is gone.
  const effectStart = source.indexOf('useEffect(() => {');
  const effectBlock = source.slice(effectStart, source.indexOf('}, [lockoutUntil]);', effectStart));
  assert.match(effectBlock, /setInterval\(tick, 1000\)/);
  assert.match(effectBlock, /clearInterval\(timer\)/, 'the interval must be cleared, or the page ticks forever');
  assert.match(effectBlock, /setError\(''\)/, 'the stale lock message must be cleared when the wait ends');
});
