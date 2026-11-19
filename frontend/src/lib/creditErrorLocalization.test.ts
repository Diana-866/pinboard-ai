import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getLocalizedApiError } from '../i18n/appErrorCopy';

/**
 * A 402 — the balance cannot cover the operation — is the most frequent failure a paying
 * customer meets. It used to arrive as Russian text with no code, so six of the seven
 * interface languages showed the wrong language and none of them could suggest the one
 * useful action: top up.
 *
 * The backend now marks every 402 with `insufficient_credits`, and the request layer turns a
 * known code into a localized message in one place instead of twenty call sites.
 */

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];

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

test('a 402 is translated into every supported interface language', () => {
  const seen = new Map<string, string>();
  for (const language of LANGUAGES) {
    const message = withStoredLanguage(language, () => getLocalizedApiError('insufficient_credits', 402));
    assert.ok(message && message.trim().length > 0, `${language} must have a message`);
    seen.set(language, message!);
  }
  assert.equal(new Set(seen.values()).size, LANGUAGES.length, 'every language must differ');
  assert.doesNotMatch(seen.get('zh')!, /[A-Za-z]{6,}/, 'the Chinese message must not be Latin');
  // The useful action must be named, not just the problem.
  assert.match(seen.get('en')!, /top up/i);
});

test('an unknown code, a wrong status or a missing code keeps the server message', () => {
  withStoredLanguage('en', () => {
    assert.equal(getLocalizedApiError('some_future_code', 402), null);
    assert.equal(getLocalizedApiError(undefined, 402), null);
    assert.equal(getLocalizedApiError(null, 402), null);
    assert.equal(getLocalizedApiError(42, 402), null);
    // The same code with a different status is not the situation we know.
    assert.equal(getLocalizedApiError('insufficient_credits', 409), null);
  });
});

test('the request layer prefers the localized message over the raw server text', () => {
  const source = readFileSync(path.join(SRC, 'lib/api.ts'), 'utf8');
  assert.match(source, /const localized = getLocalizedApiError\(data\?\.code, res\.status\);/);
  assert.match(source, /localized \|\| data\?\.error \|\| getApiFallbackMessage/);
  // The code must still reach the caller: screens branch on it.
  assert.match(source, /new ApiError\([\s\S]*?res\.status,\s*\n?\s*data/);
});

test('every 402 on the backend carries the code', () => {
  const backend = readFileSync(path.join(SRC, '../../backend/index.js'), 'utf8');
  // A plain 402 would reach the client with Russian text only.
  const plain = [...backend.matchAll(/httpError\(402,/g)];
  assert.equal(plain.length, 1, 'only the helper itself may call httpError(402, ...)');
  assert.match(backend, /function insufficientCreditsError\(message\)/);
  assert.match(backend, /code: "insufficient_credits"/);
  // The former bespoke code name is gone, so the client has one thing to map.
  assert.doesNotMatch(backend, /generation_insufficient_credits/);
});
