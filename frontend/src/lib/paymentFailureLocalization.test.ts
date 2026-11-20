import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getLocalizedApiError } from '../i18n/appErrorCopy';

/**
 * The checkout screen is the worst place for an unreadable error, and these three failures each
 * need a different action from the customer: retry, do not pay twice, retry later. They were
 * Russian-only, so a non-Russian customer saw a sentence they could not act on at the exact
 * moment money was involved - and the natural reaction to "could not save the invoice link" is
 * to start a second payment.
 *
 * Pinned here: all three messages in every supported language, gated to the statuses the backend
 * really uses, distinguishable from each other, honest (nothing claims a charge or a refund that
 * the backend cannot confirm), and emitted by the backend modules we think emit them.
 */

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.dirname(path.dirname(SRC));
const COPY_SOURCE = readFileSync(path.join(SRC, 'i18n', 'appErrorCopy.ts'), 'utf8').split('\r\n').join('\n');
const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];

const CASES = [
  { code: 'payment_provider_unavailable', key: 'paymentProviderUnavailable', statuses: [502, 503] },
  { code: 'payment_link_not_saved', key: 'paymentLinkNotSaved', statuses: [503] },
  { code: 'payment_order_preparation_failed', key: 'paymentOrderPreparationFailed', statuses: [503] },
  // Section 112: a switched-off payment provider and an invoice that was never created. The second
  // one answers 500 on purpose - the status is ours to choose, the customer only needs to know that
  // no money moved.
  { code: 'payments_not_configured', key: 'paymentsNotConfigured', statuses: [503] },
  { code: 'payment_not_started', key: 'paymentNotStarted', statuses: [500] },
];

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
  const start = COPY_SOURCE.indexOf(`\n  ${language}: {\n`);
  assert.ok(start > -1, `language block ${language} must exist`);
  const end = COPY_SOURCE.indexOf('\n  },', start);
  assert.ok(end > start, `language block ${language} must be closed`);
  return COPY_SOURCE.slice(start, end);
}

test('every language carries all three payment failure messages', () => {
  for (const language of LANGUAGES) {
    const source = block(language);
    for (const { key } of CASES) {
      const match = new RegExp(`${key}:\\s*"([^"]+)"`).exec(source);
      assert.ok(match, `${language} must define ${key}`);
      assert.ok(match![1].trim().length > 20, `${language}.${key} must say something`);
    }
  }
});

test('the messages are translated, not English copies', () => {
  const english = block('en');
  for (const { key } of CASES) {
    const englishText = new RegExp(`${key}:\\s*"([^"]+)"`).exec(english)![1];
    for (const language of ['ru', 'zh']) {
      const text = new RegExp(`${key}:\\s*"([^"]+)"`).exec(block(language))![1];
      assert.notEqual(text, englishText, `${language}.${key} must differ from English`);
    }
    const chinese = new RegExp(`${key}:\\s*"([^"]+)"`).exec(block('zh'))![1];
    assert.match(chinese, /[\u4e00-\u9fff]/, `zh.${key} must be written in Chinese`);
  }
});

test('each payment code is localized at the status the backend uses', () => {
  withStoredLanguage('en', () => {
    for (const { code, statuses } of CASES) {
      for (const status of statuses) {
        assert.ok(getLocalizedApiError(code, status), `${code} at ${status} must be localized`);
      }
      // The same code at a status the backend does not use is not this failure.
      for (const status of [400, 401, 402, 403, 404, 409, 422, 500]) {
        if (statuses.includes(status)) continue;
        assert.equal(getLocalizedApiError(code, status), null, `${code} at ${status} must stay unmapped`);
      }
    }
    assert.equal(getLocalizedApiError('some_future_payment_code', 503), null);
    assert.equal(getLocalizedApiError('insufficient_credits', 503), null);
  });
});

test('the payment failures read differently and say what to do', () => {
  // Each code is asked at its own status: `payment_not_started` answers 500 by design.
  const messages = withStoredLanguage('en', () =>
    CASES.map(({ code, statuses }) => getLocalizedApiError(code, statuses[0])!));
  assert.equal(new Set(messages).size, CASES.length, 'every situation needs its own sentence');

  // "do not pay twice" must be explicit: that is the expensive mistake.
  assert.match(messages[1]!, /not.*another payment|could not save/i);
  // "nothing was charged" is only claimed where the customer received no link at all.
  assert.match(messages[0]!, /nothing has been charged/i);
  // No message may promise a refund or a deleted publication.
  for (const message of messages) {
    assert.doesNotMatch(message!, /refund|deleted/i);
  }
});

test('the backend emits each payment code the client maps', () => {
  const sources = ['billing.js', 'creditsBilling.js', 'prodamus.js', 'paymentErrors.js']
    .map((file) => readFileSync(path.join(REPO_ROOT, 'backend', file), 'utf8'))
    .join('\n');
  // `payments_not_configured` is plural, so the prefix must allow it: a scanner pinned to
  // `payment_` would have reported a mapped code as never emitted.
  const mapped = [...COPY_SOURCE.matchAll(/^\s{2}(payment[a-z]*_[a-z_]+):/gm)].map((match) => match[1]);

  assert.deepEqual(mapped.sort(), CASES.map(({ code }) => code).sort());
  for (const code of mapped) {
    assert.ok(sources.includes(`"${code}"`), `backend must emit ${code}`);
  }
});
