import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getAuthCopy, getAuthErrorMessage } from '../i18n/authCopy';
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
    // Non-Latin scripts must not have leaked the Latin text.
    assert.doesNotMatch(chinese as string, /[A-Za-z]{6,}/, `${code} zh must not be Latin`);
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

  assert.match(login, /getAuthErrorMessage\(err\?\.data\?\.code, language\)\s*\|\|\s*err\?\.message/);
  assert.match(register, /getAuthErrorMessage\(err\?\.data\?\.code, language\)\s*\|\|\s*err\.message/);
  // The verification-email branch must survive the change: it drives the resend UI.
  assert.match(login, /email_not_verified/);
});

test('the backend actually sends the codes the client maps', () => {
  const repoRoot = path.dirname(path.dirname(SRC));
  const authSource = readFileSync(path.join(repoRoot, 'backend', 'auth.js'), 'utf8');
  for (const code of KNOWN_CODES) {
    assert.match(authSource, new RegExp(`"${code}"`), `backend must emit ${code}`);
  }
});
