import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getAuthCopy, getAuthErrorMessage, withLockoutWait } from '../i18n/authCopy';
import { SUPPORTED_LANGUAGES } from '../i18n/types';

/**
 * The backend answers in Russian and now also sends a stable code for the failures a
 * person actually reads (wrong password, email already registered, account being
 * deleted). Without this mapping every non-Russian customer was shown Russian text on
 * the two pages they meet first: /login and /register.
 *
 * An unknown code must fall through to the server message: inventing a message for a
 * failure we do not understand would be worse than showing the original.
 */

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const KNOWN_CODES = [
  'invalid_credentials',
  'email_already_registered',
  'account_pending_deletion',
  'login_locked',
];

test('known code maps to a message in every supported language', () => {
  for (const language of SUPPORTED_LANGUAGES.map((entry) => entry.code)) {
    for (const code of KNOWN_CODES) {
      const message = getAuthErrorMessage(code, language as any);
      assert.equal(typeof message, 'string', `${code} must map for ${language}`);
      assert.ok(message && message.trim().length > 0, `${code}/${language} must not be empty`);
    }
  }
});

test('the localized messages are actually localized, not the same string everywhere', () => {
  for (const code of KNOWN_CODES) {
    const english = getAuthErrorMessage(code, 'en' as any);
    const russian = getAuthErrorMessage(code, 'ru' as any);
    const chinese = getAuthErrorMessage(code, 'zh' as any);
    assert.notEqual(english, russian, `${code} must differ between en and ru`);
    assert.notEqual(english, chinese, `${code} must differ between en and zh`);
    // Non-Latin scripts must not have leaked the Latin text. The {minutes} placeholder is
    // deliberately Latin - it is a template token the caller replaces, not prose.
    assert.doesNotMatch((chinese as string).replace(/\{minutes\}/g, ''), /[A-Za-z]{6,}/,
      `${code} zh must not be Latin`);
  }
});

test('an unknown or missing code returns null so the caller keeps the server text', () => {
  for (const code of [undefined, null, '', 'some_future_code', 42, {}, ['invalid_credentials']]) {
    assert.equal(getAuthErrorMessage(code, 'en' as any), null, `code ${String(code)} must not map`);
  }
});

test('an unsupported language falls back to English instead of throwing', () => {
  assert.equal(
    getAuthErrorMessage('invalid_credentials', 'xx' as any),
    getAuthErrorMessage('invalid_credentials', 'en' as any)
  );
});

test('every language block in the auth copy carries the new keys', () => {
  // getAuthCopy returns a flat object; a missing key would render "undefined" in the UI.
  for (const language of SUPPORTED_LANGUAGES.map((entry) => entry.code)) {
    const copy = getAuthCopy(language as any) as Record<string, unknown>;
    for (const key of ['errorInvalidCredentials', 'errorEmailAlreadyRegistered', 'errorAccountPendingDeletion']) {
      assert.equal(typeof copy[key], 'string', `${language}.${key} must exist`);
    }
  }
});

test('the login and register pages use the mapping instead of the raw server message', () => {
  const login = readFileSync(path.join(SRC, 'pages/Login.tsx'), 'utf8');
  const register = readFileSync(path.join(SRC, 'pages/Register.tsx'), 'utf8');

  // Login composes the message because a lockout carries the remaining wait; Register keeps the
  // plain "mapped message, else the server text" shape.
  assert.match(login, /getAuthErrorMessage\(err\?\.data\?\.code, language\)/);
  assert.match(login, /withLockoutWait\(mapped, Number\(err\?\.data\?\.retryAfterSeconds\) \|\| 0\)/);
  assert.doesNotMatch(login, /prev\(|console\.log/, 'no debug leftovers in the error path');
  assert.match(register, /getAuthErrorMessage\(err\?\.data\?\.code, language\)\s*\|\|\s*err\.message/);
  // The verification-email branch must survive the change: it drives the resend UI.
  assert.match(login, /email_not_verified/);
});

test('the backend actually sends the codes the client maps', () => {
  const repoRoot = path.dirname(path.dirname(SRC));
  const authSource = readFileSync(path.join(repoRoot, 'backend', 'auth.js'), 'utf8');
  // The lockout refusal lives in its own module since §60; the code must still exist in the
  // backend, whichever file owns it.
  const lockoutSource = readFileSync(path.join(repoRoot, 'backend', 'loginLockout.js'), 'utf8');
  const backend = authSource + lockoutSource;
  for (const code of KNOWN_CODES) {
    assert.match(backend, new RegExp(`"${code}"`), `backend must emit ${code}`);
  }
});

test('a lockout message carries the wait instead of a placeholder', () => {
  // The lockout is the one message with a value the backend knows: the remaining lock time.
  // Leaving "{minutes}" on screen would be a visible defect on the page nobody can get past.
  const english = getAuthErrorMessage('login_locked', 'en' as any) as string;
  assert.match(english, /\{minutes\}/, 'the template must keep its placeholder');
  assert.equal(withLockoutWait(english, 600), english.replace('{minutes}', '10'));
  assert.equal(withLockoutWait(english, 30), english.replace('{minutes}', '1'),
    'a partial minute is rounded up, so nobody is told to wait 0 minutes');
  assert.equal(withLockoutWait(english, 0), english.replace('{minutes}', '15'),
    'an unknown wait falls back to the default lockout instead of showing 0');
  for (const language of SUPPORTED_LANGUAGES.map((entry) => entry.code)) {
    const message = getAuthErrorMessage('login_locked', language as any) as string;
    assert.match(message, /\{minutes\}/, `${language} must keep the placeholder`);
    assert.doesNotMatch(withLockoutWait(message, 900), /\{minutes\}/, `${language} must render the wait`);
  }
});

test('a lockout is never rendered as a wrong password', () => {
  // Sending a locked-out customer to "wrong email or password" starts a reset loop they do not
  // need, and it hides the real state from the one person who owns the account.
  const locked = getAuthErrorMessage('login_locked', 'en' as any);
  const wrong = getAuthErrorMessage('invalid_credentials', 'en' as any);
  assert.notEqual(locked, wrong);
  assert.match(locked as string, /lock/i);
});
