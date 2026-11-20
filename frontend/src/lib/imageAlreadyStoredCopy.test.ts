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

test('a customer whose image is already saved is told not to upload it again', () => {
  // Section 113. The backend answers 503 with `image_already_stored` when the picture is in Storage
  // but its link is unavailable. Without the sentence the customer uploads it a second time - the
  // one thing the message exists to prevent.
  for (const language of LANGUAGES) {
    const message = withStoredLanguage(language, () => getLocalizedApiError('image_already_stored', 503));
    assert.ok(message && message.trim().length > 0, `${language} must translate image_already_stored`);
  }
  const english = withStoredLanguage('en', () => getLocalizedApiError('image_already_stored', 503))!;
  assert.match(english, /already saved/i);
  assert.match(english, /not need to upload|need to upload it again/i);
  const russian = withStoredLanguage('ru', () => getLocalizedApiError('image_already_stored', 503))!;
  assert.match(russian, /уже сохранено/);
  assert.match(russian, /не нужно/);
});

test('it is a temporary-failure message, not a validation error', () => {
  withStoredLanguage('en', () => {
    for (const status of [502, 503]) {
      assert.ok(getLocalizedApiError('image_already_stored', status), `status ${status}`);
    }
    for (const status of [400, 409, 422, 500]) {
      assert.equal(getLocalizedApiError('image_already_stored', status), null, `status ${status}`);
    }
  });
});
