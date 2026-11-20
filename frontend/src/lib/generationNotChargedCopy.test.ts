import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocalizedApiError } from '../i18n/appErrorCopy';

const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'] as const;

function withStoredLanguage<T>(language: string, run: () => T): T {
  const store = new Map<string, string>();
  store.set('pinposy_lang', language);
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

test('a failed generation that spent nothing says so, in every language', () => {
  // Section 115. The database returns the credit reservation when no image was ever requested; the
  // customer previously read "внутренняя ошибка сервера" and could not tell a free failure from a
  // charged one - the difference between retrying and writing to support about money.
  for (const language of LANGUAGES) {
    const message = withStoredLanguage(language, () => getLocalizedApiError('generation_not_charged', 502));
    assert.ok(message && message.trim().length > 0, `${language} must translate generation_not_charged`);
  }
  const english = withStoredLanguage('en', () => getLocalizedApiError('generation_not_charged', 502))!;
  assert.match(english, /nothing was charged/i);
  assert.match(english, /credits are back|back in your balance/i);
  const russian = withStoredLanguage('ru', () => getLocalizedApiError('generation_not_charged', 502))!;
  assert.match(russian, /ничего не списано/);
  assert.match(russian, /баланс/i);
});

test('it names the money fact on any status the route can choose, and never on success', () => {
  withStoredLanguage('en', () => {
    // The route can answer 402, 422, 500 or 502 on a failure that spent nothing.
    for (const status of [402, 422, 500, 502, 503]) {
      assert.ok(getLocalizedApiError('generation_not_charged', status), `status ${status}`);
    }
    for (const status of [200, 201]) {
      assert.equal(getLocalizedApiError('generation_not_charged', status), null, `status ${status}`);
    }
  });
});

test('it never promises a refund', () => {
  const english = withStoredLanguage('en', () => getLocalizedApiError('generation_not_charged', 502))!;
  assert.doesNotMatch(english, /refund/i, 'the reservation was released; nothing is being refunded');
});
