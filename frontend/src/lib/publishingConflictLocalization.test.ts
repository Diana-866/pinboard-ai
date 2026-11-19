import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getLocalizedApiError } from '../i18n/appErrorCopy';

/**
 * These three 409s are the messages a customer meets while actually trying to publish: no
 * Pinterest account connected yet, the pin is already scheduled, or the publication is not in
 * the Failed state that the retry and board-change actions require. They were Russian-only
 * with no code, so the most actionable moments in the product were unreadable for six of the
 * seven languages.
 */

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];
const CODES = ['pinterest_not_connected', 'pin_already_scheduled', 'publication_not_failed'];

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

test('the publishing preconditions are translated into every language', () => {
  for (const language of LANGUAGES) {
    for (const code of CODES) {
      const message = withStoredLanguage(language, () => getLocalizedApiError(code, 409));
      assert.ok(message && message.trim().length > 0, `${code}/${language} must have a message`);
    }
  }
});

test('each precondition says what to do, and they are distinct', () => {
  const english = CODES.map((code) => withStoredLanguage('en', () => getLocalizedApiError(code, 409))!);
  assert.equal(new Set(english).size, CODES.length, 'two preconditions share one message');
  assert.match(english[0], /connect .* Pinterest/i, 'the account message must say to connect');
  assert.match(english[1], /calendar/i, 'the already-scheduled message must point at the calendar');
  assert.match(english[2], /failed/i, 'the action message must name the required status');

  const latinResidue = (text: string) => text.replace(/Pinterest|PinPosy|Pin|HTTPS|ID/g, '');
  for (const code of CODES) {
    const zh = withStoredLanguage('zh', () => getLocalizedApiError(code, 409))!;
    assert.doesNotMatch(latinResidue(zh), /[A-Za-z]{4,}/, `${code} zh must not be English`);
  }
});

test('a conflict code is only translated for 409', () => {
  withStoredLanguage('en', () => {
    for (const status of [400, 404, 422, 500]) {
      assert.equal(getLocalizedApiError('pin_already_scheduled', status), null);
    }
    assert.equal(getLocalizedApiError('some_future_conflict', 409), null);
  });
});

test('the backend emits exactly the conflict codes the client maps', () => {
  const backend = readFileSync(path.join(SRC, '../../backend/index.js'), 'utf8');
  const emitted = new Set([...backend.matchAll(/conflictError\("([a-z_]+)"/g)].map((match) => match[1]));
  assert.ok(emitted.size > 0, 'the backend must emit conflict codes');

  const copySource = readFileSync(path.join(SRC, 'i18n/appErrorCopy.ts'), 'utf8');
  const start = copySource.indexOf('const CONFLICT_CODES');
  assert.ok(start > 0, 'the conflict mapping must exist');
  const table = copySource.slice(start, copySource.indexOf('};', start));
  const mapped = new Set([...table.matchAll(/^  ([a-z_]+):/gm)].map((match) => match[1]));

  assert.deepEqual([...emitted].sort(), [...mapped].sort(), 'backend codes and client mapping must be the same set');
});

test('the account precondition is not weakened into silence', () => {
  const backend = readFileSync(path.join(SRC, '../../backend/index.js'), 'utf8');
  // Whatever the wording, scheduling without a connected account must still be refused.
  const accountPrecondition = /conflictError\("pinterest_not_connected", "([^"]+)"\)/.exec(backend);
  assert.ok(accountPrecondition, 'the account precondition must exist');
  assert.match(accountPrecondition![1], /Pinterest/);
});
