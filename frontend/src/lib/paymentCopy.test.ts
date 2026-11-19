import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getAppErrorMessage } from '../i18n/appErrorCopy';

/**
 * Payment link creation is the one failure in `lib/billing.ts` a paying customer can
 * actually hit (a misconfigured shop, a provider outage), and the module is not a React
 * component, so it had a hardcoded Russian message. It now reads the interface language
 * from the same storage the request layer already uses.
 *
 * The map is deliberately small: only messages a customer can actually see belong here.
 */

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];

/** `authStorage` reads `window.localStorage`, so a `window` stub is enough. */
function withStoredLanguage(language: string | null, run: () => void) {
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
    run();
  } finally {
    delete (globalThis as any).window;
  }
}

test('the payment-link message exists in every supported interface language', () => {
  const seen = new Map<string, string>();
  for (const language of LANGUAGES) {
    withStoredLanguage(language, () => {
      const message = getAppErrorMessage('paymentLinkMissing');
      assert.ok(message && message.trim().length > 0, `${language} must have a message`);
      seen.set(language, message);
    });
  }
  // The same string everywhere would mean nothing was translated.
  assert.equal(new Set(seen.values()).size, LANGUAGES.length, 'every language must differ');
  assert.doesNotMatch(seen.get('zh')!, /[A-Za-z]{6,}/, 'the Chinese message must not be Latin');
});

test('an unknown, missing or unreadable stored language falls back to English', () => {
  for (const stored of [null, '', 'ja', 'xx-YY', 'EN-gb']) {
    withStoredLanguage(stored, () => {
      const message = getAppErrorMessage('paymentLinkMissing');
      assert.match(message, /payment link/, `stored language ${String(stored)} must fall back`);
    });
  }

  // No window at all (server-side render, restricted context) must not throw.
  const message = getAppErrorMessage('paymentLinkMissing');
  assert.match(message, /payment link/);

  // A throwing storage must not escape either.
  (globalThis as any).window = {
    get localStorage() { throw new Error('blocked'); },
  };
  try {
    assert.match(getAppErrorMessage('paymentLinkMissing'), /payment link/);
  } finally {
    delete (globalThis as any).window;
  }
});

test('billing no longer hardcodes the payment message', () => {
  const source = readFileSync(path.join(SRC, 'lib/billing.ts'), 'utf8');
  assert.doesNotMatch(source, /Сервер не вернул ссылку на оплату/);
  // Both creation paths (subscription and credit pack) must use the localized copy.
  assert.equal(
    (source.match(/getAppErrorMessage\('paymentLinkMissing'\)/g) || []).length,
    2
  );
});
