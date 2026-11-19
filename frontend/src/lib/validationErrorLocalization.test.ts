import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getLocalizedApiError } from '../i18n/appErrorCopy';

/**
 * 422 is the largest error class on the backend (28 sites), but the messages are
 * field-specific, so coding every rule would mean roughly two hundred translations. The
 * hybrid that was chosen: the failures a customer can cause and fix themselves carry a code
 * and are translated; internal contract violations (a malformed Idempotency-Key, an unknown
 * status) keep the server text, because nothing the person does can act on them.
 *
 * This test pins that split in both directions, so a new code cannot be emitted without a
 * translation and a translation cannot exist unused.
 */

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];

const CODES = [
  'board_name_required',
  'invalid_schedule_time',
  'schedule_too_far',
  'invalid_timezone',
  'project_url_required',
  'project_url_invalid',
  'pin_image_missing',
  'board_selection_required',
  'image_upload_required',
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

test('every actionable validation code is translated into every language', () => {
  for (const language of LANGUAGES) {
    for (const code of CODES) {
      const message = withStoredLanguage(language, () => getLocalizedApiError(code, 422));
      assert.ok(message && message.trim().length > 0, `${code}/${language} must have a message`);
    }
  }
});

test('the messages differ from each other and are really translated', () => {
  const english = CODES.map((code) => withStoredLanguage('en', () => getLocalizedApiError(code, 422))!);
  assert.equal(new Set(english).size, CODES.length, 'two codes share one message');
  const latinResidue = (text: string) => text.replace(/Pinterest|PinPosy|Pin|HTTPS|HTTP|PNG|JPG|WebP|GIF|MB|ID/g, '');
  for (const code of CODES) {
    const zh = withStoredLanguage('zh', () => getLocalizedApiError(code, 422))!;
    assert.doesNotMatch(latinResidue(zh), /[A-Za-z]{4,}/, `${code} zh must not be English`);
  }
  // Every message must name the thing to fix, not just say "invalid".
  for (const message of english) {
    assert.match(message, /board|date|time|zone|URL|image|Pinterest|publication|year/i, message);
  }
});

test('a validation code is only translated for 422', () => {
  withStoredLanguage('en', () => {
    for (const status of [400, 404, 409, 500]) {
      assert.equal(getLocalizedApiError('board_name_required', status), null, `status ${status} must not translate it`);
    }
    // And a 422 with an unknown code keeps the server text.
    assert.equal(getLocalizedApiError('some_future_rule_violation', 422), null);
    assert.equal(getLocalizedApiError(undefined, 422), null);
  });
});

test('the backend emits exactly the codes the client can render', () => {
  const backend = readFileSync(path.join(SRC, '../../backend/index.js'), 'utf8');
  const emitted = new Set([...backend.matchAll(/validationError\("([a-z_]+)"/g)].map((match) => match[1]));
  assert.ok(emitted.size > 0, 'the backend must emit validation codes');

  // The mapping table itself is read from source, not assumed from the list above: a code the
  // client maps but the backend never emits is dead weight that rots silently.
  const copySource = readFileSync(path.join(SRC, 'i18n/appErrorCopy.ts'), 'utf8');
  const tableStart = copySource.indexOf('const VALIDATION_CODES');
  assert.ok(tableStart > 0, 'the validation mapping must exist');
  const table = copySource.slice(tableStart, copySource.indexOf('};', tableStart));
  const mapped = new Set([...table.matchAll(/^  ([a-z_]+):/gm)].map((match) => match[1]));

  assert.deepEqual(
    [...emitted].sort(),
    [...mapped].sort(),
    'backend codes and client mapping must be the same set'
  );
  for (const code of CODES) {
    assert.ok(emitted.has(code), `${code} is tested but never emitted`);
  }
});

test('the codes cover the failures a customer can actually fix, not internal contract breaches', () => {
  const backend = readFileSync(path.join(SRC, '../../backend/index.js'), 'utf8');
  // Internal contracts stay uncoded on purpose: the person cannot act on them, so a
  // translated message would add nothing and a code would be dead weight.
  for (const internalMessage of [
    "Для генерации требуется корректный Idempotency-Key",
    "Некорректный статус",
    "Нечего обновлять",
    "Укажите project_id",
  ]) {
    const plain = `httpError(422, "${internalMessage}")`;
    assert.ok(backend.includes(plain), `${internalMessage} should stay a plain 422`);
    // If it were coded, the helper call would sit immediately before the message.
    const index = backend.indexOf(`"${internalMessage}"`);
    const preceding = backend.slice(Math.max(0, index - 40), index);
    assert.doesNotMatch(preceding, /validationError\(\s*$/, `${internalMessage} must not be coded`);
  }
  // The actionable ones are coded.
  for (const actionable of ['board_name_required', 'invalid_schedule_time', 'project_url_required']) {
    assert.match(backend, new RegExp(`validationError\\("${actionable}"`));
  }
});
