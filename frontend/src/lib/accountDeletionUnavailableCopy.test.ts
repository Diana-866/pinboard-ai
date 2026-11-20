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

test('a switched-off account deletion is explained, not reported as a server error', () => {
  // Section 107. The backend answers 503 with `account_deletion_unavailable` when the deletion
  // pipeline is not running; without a translation the customer would see the raw server text.
  for (const language of LANGUAGES) {
    const message = withStoredLanguage(language, () => getLocalizedApiError('account_deletion_unavailable', 503));
    assert.ok(message && message.trim().length > 0, `${language} must translate account_deletion_unavailable`);
  }
});

test('the text says the data was not touched and what to do instead', () => {
  const english = withStoredLanguage('en', () => getLocalizedApiError('account_deletion_unavailable', 503))!;
  assert.match(english, /deletion/i);
  assert.match(english, /not been touched|untouched/i);
  assert.match(english, /support/i);
  const russian = withStoredLanguage('ru', () => getLocalizedApiError('account_deletion_unavailable', 503))!;
  assert.match(russian, /поддержк/i);
  assert.match(russian, /данные не тронуты/i);
});

test('it is only translated for a temporary failure, never for a 4xx', () => {
  withStoredLanguage('en', () => {
    for (const status of [400, 403, 409, 422, 500]) {
      assert.equal(getLocalizedApiError('account_deletion_unavailable', status), null, `status ${status}`);
    }
    for (const status of [502, 503]) {
      assert.ok(getLocalizedApiError('account_deletion_unavailable', status), `status ${status} must translate`);
    }
  });
});
