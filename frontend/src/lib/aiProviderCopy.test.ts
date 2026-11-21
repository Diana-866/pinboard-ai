import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocalizedApiError } from '../i18n/appErrorCopy';

/**
 * Section 161. The backend refuses generation with `503 ai_provider_not_configured` when the AI key is a
 * placeholder (§159). Without a mapping the customer reads the backend's Russian sentence - or a generic
 * "something went wrong" - on the screen where credits are spent, which is the worst place to be vague.
 */

const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'] as const;

function withLanguage<T>(language: string, action: () => T): T {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  const globals = globalThis as any;
  const previousWindow = globals.window;
  const previousStorage = globals.localStorage;
  globals.window = { localStorage: storage };
  globals.localStorage = storage;
  storage.setItem('pinposy_lang', language);
  try {
    return action();
  } finally {
    globals.window = previousWindow;
    globals.localStorage = previousStorage;
  }
}

test('the new refusal has a message in every language', () => {
  const missing: string[] = [];
  for (const language of LANGUAGES) {
    const message = withLanguage(language, () => getLocalizedApiError('ai_provider_not_configured', 503));
    if (!message || message.length < 40) missing.push(`${language}: ${JSON.stringify(message)}`);
  }
  assert.deepEqual(missing, [], missing.join('\n'));
});

test('the message says nothing was charged', () => {
  const claims: Record<string, RegExp> = {
    en: /nothing was charged/i,
    ru: /кредиты не списываются/i,
    es: /no se ha cobrado/i,
    pt: /nada foi cobrado/i,
    de: /nichts berechnet/i,
    fr: /rien n'a été facturé/i,
    zh: /未扣除/,
  };
  for (const language of LANGUAGES) {
    const message = withLanguage(language, () => getLocalizedApiError('ai_provider_not_configured', 503));
    assert.match(message!, claims[language], `${language} does not state that nothing was charged`);
  }
});

test('only Russian answers in Cyrillic', () => {
  const offenders: string[] = [];
  for (const language of LANGUAGES) {
    if (language === 'ru') continue;
    const message = withLanguage(language, () => getLocalizedApiError('ai_provider_not_configured', 503));
    if (/[\u0410-\u044f\u0401\u0451]/.test(message!)) offenders.push(`${language}: ${message}`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('other statuses do not reuse this message', () => {
  const message = withLanguage('en', () => getLocalizedApiError('ai_provider_not_configured', 400));
  assert.equal(message, null);
});
