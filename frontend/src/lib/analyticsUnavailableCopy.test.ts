import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocalizedApiError } from '../i18n/appErrorCopy';

/**
 * Section 137. The analytics route answered 503 with no machine code, so the screen could only show the
 * generic "internal error" while the customer's data was fine - the only thing broken was the read. The
 * backend now sends `analytics_unavailable`; these tests keep the client side of that contract honest.
 */

const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'] as const;

/** The fact the customer needs: the history is not lost. Per language, because a translation is not a fact. */
const HISTORY_WORD: Record<string, RegExp> = {
  en: /histor/i,
  ru: /истори/i,
  es: /historial/i,
  pt: /hist[óo]rico/i,
  de: /historie|verlauf/i,
  fr: /historique/i,
  zh: /历史/,
};

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

test('the analytics outage is translated into every supported language', () => {
  for (const language of LANGUAGES) {
    const copy = withStoredLanguage(language, () => getLocalizedApiError('analytics_unavailable', 503));
    assert.ok(copy && copy.trim().length > 0, `${language}: no copy`);
    assert.match(copy!, HISTORY_WORD[language], `${language}: copy does not say the history is safe: ${copy}`);
  }
});

test('no language other than Russian answers in Cyrillic', () => {
  for (const language of LANGUAGES) {
    if (language === 'ru') continue;
    const copy = withStoredLanguage(language, () => getLocalizedApiError('analytics_unavailable', 503));
    assert.doesNotMatch(copy!, /[\u0410-\u044f\u0401\u0451]/, `${language}: ${copy}`);
  }
});

test('the code is not accepted on a status the route cannot send', () => {
  // 400/401/404 — не тот класс: код приходит только с серверным сбоем, и молчаливое расширение
  // множества статусов скрыло бы, что клиент и сервер разошлись.
  for (const status of [400, 401, 402, 404, 409, 422]) {
    const copy = withStoredLanguage('en', () => getLocalizedApiError('analytics_unavailable', status));
    assert.equal(copy, null, `status ${status} accepted the code`);
  }
});

test('the outage message is not the generic "something went wrong"', () => {
  const copy = withStoredLanguage('en', () => getLocalizedApiError('analytics_unavailable', 503));
  const generic = withStoredLanguage('en', () => getLocalizedApiError('some_other_code', 503));
  assert.notEqual(copy, generic);
  assert.match(copy!, /analytics/i);
});
