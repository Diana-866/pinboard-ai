import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getLocalizedApiError } from '../i18n/appErrorCopy';

/**
 * The paywall answers 403 with a code, and those were the last customer-visible money failures
 * with no localized message: an expired plan told every non-Russian customer, in Russian, that
 * the subscription is not active. That is the moment a product must be clearest.
 *
 * Pinned here: every supported language has both messages and they are not English copies, the
 * mapping is status-gated (a 403 for another reason must not borrow the paywall text), the two
 * refusals are distinguishable because they need different actions, and the backend really
 * emits each code the client maps, at the status the client maps it by.
 */

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.dirname(path.dirname(SRC));
// Normalized: the working tree is checked out with CRLF on Windows, and a block boundary that
// only matches LF would make this scan silently find nothing.
const COPY_SOURCE = readFileSync(path.join(SRC, 'i18n', 'appErrorCopy.ts'), 'utf8');
const NORMALIZED_COPY_SOURCE = COPY_SOURCE.split('\r\n').join('\n');
const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];

const KEYS = ['tariffRequired', 'tariffInsufficient'];

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

function block(language: string): string {
  const source = NORMALIZED_COPY_SOURCE;
  const start = source.indexOf(`\n  ${language}: {\n`);
  assert.ok(start > -1, `language block ${language} must exist`);
  const end = source.indexOf('\n  },', start);
  assert.ok(end > start, `language block ${language} must be closed`);
  return source.slice(start, end);
}

test('every language carries both paywall messages', () => {
  for (const language of LANGUAGES) {
    const source = block(language);
    for (const key of KEYS) {
      const match = new RegExp(`${key}:\\s*"([^"]+)"`).exec(source);
      assert.ok(match, `${language} must define ${key}`);
      assert.ok(match![1].trim().length > 10, `${language}.${key} must say something`);
    }
  }
});

test('the messages are genuinely translated, not English copies', () => {
  const englishText = KEYS.map((key) => new RegExp(`${key}:\\s*"([^"]+)"`).exec(block('en'))![1]);

  for (const language of ['ru', 'zh']) {
    const source = block(language);
    KEYS.forEach((key, index) => {
      const text = new RegExp(`${key}:\\s*"([^"]+)"`).exec(source)![1];
      assert.notEqual(text, englishText[index], `${language}.${key} must differ from English`);
    });
  }

  for (const key of KEYS) {
    const text = new RegExp(`${key}:\\s*"([^"]+)"`).exec(block('zh'))![1];
    assert.match(text, /[\u4e00-\u9fff]/, `zh.${key} must contain Chinese characters`);
  }
});

test('a paywall code is localized for 403 only', () => {
  withStoredLanguage('en', () => {
    for (const code of ['tariff_required', 'tariff_insufficient']) {
      assert.ok(getLocalizedApiError(code, 403), `${code} at 403 must be localized`);
      for (const status of [402, 404, 409, 422, 500, 503]) {
        assert.equal(getLocalizedApiError(code, status), null, `${code} at ${status} is not a paywall answer`);
      }
    }
    // A 403 for a different reason must not borrow the paywall text.
    assert.equal(getLocalizedApiError('email_not_verified', 403), null);
    assert.equal(getLocalizedApiError('some_future_code', 403), null);
    assert.equal(getLocalizedApiError(null, 403), null);
  });
});

test('the two refusals read differently, because they need different actions', () => {
  const required = withStoredLanguage('en', () => getLocalizedApiError('tariff_required', 403));
  const insufficient = withStoredLanguage('en', () => getLocalizedApiError('tariff_insufficient', 403));
  assert.notEqual(required, insufficient);
  // Neither may sound like the customer lost work.
  for (const message of [required!, insufficient!]) {
    assert.doesNotMatch(message, /lost|deleted|charge|refund/i);
  }
});

test('the backend emits every paywall code the client maps', () => {
  const tariff = readFileSync(path.join(REPO_ROOT, 'backend', 'tariff.js'), 'utf8');
  const mapped = [...COPY_SOURCE.matchAll(/^\s{2}(tariff_[a-z_]+):/gm)].map((match) => match[1]);
  assert.deepEqual(mapped.sort(), ['tariff_insufficient', 'tariff_required']);

  for (const code of mapped) {
    assert.ok(tariff.includes(`"${code}"`), `backend/tariff.js must emit ${code}`);
  }
});

test('the guard answers the status the client maps the code by', () => {
  const tariff = readFileSync(path.join(REPO_ROOT, 'backend', 'tariff.js'), 'utf8');
  const refusals = [...tariff.matchAll(/res\.status\((\d+)\)\.json\(\{\s*error:[\s\S]{0,300}?code: "(tariff_[a-z_]+)"/g)]
    .map((match) => ({ status: Number(match[1]), code: match[2] }));

  assert.ok(refusals.length >= 2, 'both refusals must be found');
  for (const refusal of refusals) {
    assert.equal(refusal.status, 403, `${refusal.code} must keep the status the client maps`);
  }
});
