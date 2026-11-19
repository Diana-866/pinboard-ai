import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getLocalizedApiError } from '../i18n/appErrorCopy';

/**
 * When Pinterest itself is unavailable or rate-limiting, the customer's only useful
 * information is that it is not their mistake and that retrying shortly is right. The
 * backend said that in Russian only. The wording here is deliberately neutral: nothing about
 * credits or publications is promised, because the provider's exact state is not known from
 * this side.
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

const CODES = ['pinterest_unavailable', 'pinterest_rate_limited'];

test('both provider failures are translated and the two differ', () => {
  for (const language of LANGUAGES) {
    for (const code of CODES) {
      const message = withStoredLanguage(language, () => getLocalizedApiError(code, 503));
      assert.ok(message && message.trim().length > 0, `${code}/${language} must have a message`);
    }
  }
  const english = CODES.map((code) => withStoredLanguage('en', () => getLocalizedApiError(code, 503))!);
  assert.notEqual(english[0], english[1], 'unavailable and rate-limited are different situations');
  // Each one tells the person what to do.
  assert.match(english[0], /try .*again/i);
  assert.match(english[1], /wait/i);
});

test('the same code is translated for 502 and 503, and not for other statuses', () => {
  withStoredLanguage('en', () => {
    for (const status of [502, 503]) {
      assert.ok(getLocalizedApiError('pinterest_unavailable', status));
    }
    for (const status of [400, 404, 409, 422, 500]) {
      assert.equal(getLocalizedApiError('pinterest_unavailable', status), null);
    }
    assert.equal(getLocalizedApiError('some_future_provider_code', 503), null);
  });
});

test('the messages promise nothing about credits or publications', () => {
  // Honesty constraint: the provider's state is unknown, so the text must not claim that a
  // publication succeeded, failed, was charged, or was refunded.
  const english = CODES.map((code) => withStoredLanguage('en', () => getLocalizedApiError(code, 503))!);
  for (const message of english) {
    assert.doesNotMatch(message, /charged|refunded|credit|published|will be/i, message);
  }
});

test('the backend marks every provider-side failure with these codes', () => {
  const backend = readFileSync(path.join(SRC, '../../backend/pinterest.js'), 'utf8');
  const emitted = new Set([...backend.matchAll(/pinterestTransientError\("([a-z_]+)"/g)].map((m) => m[1]));
  assert.ok(emitted.size > 0, 'the backend must mark provider failures');
  assert.deepEqual([...emitted].sort(), [...CODES].sort());

  // The helper must keep the status the call site chose (502 for a failed board check).
  assert.match(backend, /function pinterestTransientError\(code, message, status = 503\)/);
  assert.match(backend, /pinterest_unavailable", "Не удалось проверить выбранную доску Pinterest\.[^"]*", 502\)/);
});
