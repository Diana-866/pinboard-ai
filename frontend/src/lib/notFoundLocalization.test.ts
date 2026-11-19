import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getLocalizedApiError } from '../i18n/appErrorCopy';

/**
 * "Not found" is the second-most common user-visible error after validation: a stale link, a
 * board deleted in another tab, a schedule entry someone else removed. Twenty sites answered
 * 404 with ten different Russian texts and no code, so six of the seven interface languages
 * showed the wrong language and none told the person what to do next.
 */

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];

const CODES = [
  'project_not_found',
  'board_not_found',
  'pin_not_found',
  'schedule_not_found',
  'publication_not_found',
  'generation_request_not_found',
  'pinterest_account_not_found',
  'user_not_found',
];

function withStoredLanguage<T>(language: string | null, run: () => T): T {
  const store = new Map<string, string>();
  if (language !== null) store.set('pinposy_lang', language);
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
  };
  try {
    return run();
  } finally {
    delete (globalThis as any).window;
  }
}

test('every not-found code is translated into every supported language', () => {
  for (const language of LANGUAGES) {
    for (const code of CODES) {
      const message = withStoredLanguage(language, () => getLocalizedApiError(code, 404));
      assert.ok(message && message.trim().length > 0, `${code}/${language} must have a message`);
    }
  }
});

test('different entities say different things', () => {
  const english = new Map<string, string>();
  for (const code of CODES) {
    const message = withStoredLanguage('en', () => getLocalizedApiError(code, 404))!;
    assert.equal(english.has(message), false, `${code} duplicates another message: ${message}`);
    english.set(message, code);
  }
  assert.equal(english.size, CODES.length);
  // The Chinese set must also be genuinely translated. Product and protocol names stay in
  // Latin by design, so they are removed before looking for untranslated English text.
  const latinResidue = (text: string) => text.replace(/Pinterest|PinPosy|Pin|HTTPS|ID/g, '');
  for (const code of CODES) {
    const zh = withStoredLanguage('zh', () => getLocalizedApiError(code, 404))!;
    assert.doesNotMatch(latinResidue(zh), /[A-Za-z]{4,}/, `${code} zh must not be English`);
  }
});

test('the messages tell the person what to do next', () => {
  const english = CODES.map((code) => withStoredLanguage('en', () => getLocalizedApiError(code, 404))!);
  // Every one of them either says to refresh/reconnect or that the object is gone for good.
  for (const message of english) {
    assert.match(message, /refresh|reconnect|sign in|no longer|deleted|not found/i, message);
  }
});

test('a 404 with an unknown code, or a known code with another status, keeps the server text', () => {
  withStoredLanguage('en', () => {
    assert.equal(getLocalizedApiError('some_future_object_not_found', 404), null);
    assert.equal(getLocalizedApiError('project_not_found', 409), null);
    assert.equal(getLocalizedApiError('project_not_found', 500), null);
    // The credit code must not answer for a 404.
    assert.equal(getLocalizedApiError('insufficient_credits', 404), null);
  });
});

test('the backend routes every 404 through the helper that sets a code', () => {
  const backend = readFileSync(path.join(SRC, '../../backend/index.js'), 'utf8');
  const plain = [...backend.matchAll(/httpError\(404,/g)];
  assert.equal(plain.length, 1, 'only the helper may call httpError(404, ...)');
  assert.match(backend, /function notFoundError\(code, message\)/);
  assert.match(backend, /error\.details = \{ \.\.\.\(error\.details \|\| \{\}\), code \};/);

  // Every code the client maps must exist in the backend, or the mapping is decoration.
  for (const code of CODES) {
    assert.match(backend, new RegExp(`notFoundError\\("${code}"`), `backend never emits ${code}`);
  }
  // And the backend must not invent codes the client cannot render.
  const emitted = new Set([...backend.matchAll(/notFoundError\("([a-z_]+)"/g)].map((match) => match[1]));
  for (const code of emitted) {
    assert.ok(CODES.includes(code), `client has no message for ${code}`);
  }
});
