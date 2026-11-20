import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getLocalizedApiError } from '../i18n/appErrorCopy';

const SRC = path.dirname(fileURLToPath(import.meta.url));
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

test('an unconfirmed publication tells the customer not to publish again', () => {
  // Section 109. The backend now answers 502/503 with `publication_reconciliation_required` when a
  // pin may already exist on Pinterest; the one piece of advice that must arrive is "do not repeat".
  for (const language of LANGUAGES) {
    const message = withStoredLanguage(language, () =>
      getLocalizedApiError('publication_reconciliation_required', 503));
    assert.ok(message && message.trim().length > 0, `${language} must translate the code`);
  }
  const english = withStoredLanguage('en', () => getLocalizedApiError('publication_reconciliation_required', 502))!;
  assert.match(english, /do not publish/i);
  assert.match(english, /duplicate/i);
  const russian = withStoredLanguage('ru', () => getLocalizedApiError('publication_reconciliation_required', 503))!;
  assert.match(russian, /Не публикуйте/);
  assert.match(russian, /дубликат/i);
});

test('the code is translated for both temporary statuses the backend uses, and nothing else', () => {
  withStoredLanguage('en', () => {
    for (const status of [502, 503]) {
      assert.ok(getLocalizedApiError('publication_reconciliation_required', status), `status ${status}`);
    }
    for (const status of [400, 403, 409, 422, 500]) {
      assert.equal(getLocalizedApiError('publication_reconciliation_required', status), null, `status ${status}`);
    }
  });
});

test('every backend site that blocks a repeat carries the code', () => {
  // The code is only useful if the paths that forbid a retry actually raise it: this reads the
  // backend source and refuses a new "повторная публикация заблокирована" message without the code.
  const pinterest = readFileSync(path.join(SRC, '../../../backend/pinterest.js'), 'utf8')
    .replace(/\r\n/g, '\n');
  // The message itself may contain a semicolon, so the match runs to the end of the statement.
  const blocking = [...pinterest.matchAll(/throw (httpError|publicationReconciliationError)\(([\s\S]*?)\);$/gm)]
    .filter((match) => /Повторн(ая|ый)/i.test(match[2]));
  assert.ok(blocking.length >= 5, `the scanner must find the blocking refusals, found ${blocking.length}`);
  for (const match of blocking) {
    assert.equal(match[1], 'publicationReconciliationError', `a blocking refusal without the code: ${match[2].slice(0, 60)}`);
  }
});
