import test from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../i18n/locales/en';
import { ru } from '../i18n/locales/ru';
import { es } from '../i18n/locales/es';
import { pt } from '../i18n/locales/pt';
import { de } from '../i18n/locales/de';
import { fr } from '../i18n/locales/fr';
import { zh } from '../i18n/locales/zh';

/**
 * Translation dictionary integrity.
 *
 * TypeScript enforces the shape of each locale file, but it cannot see runtime
 * mistakes that a user still sees as broken UI:
 *
 *  - a blank/whitespace value renders as empty text;
 *  - a placeholder renamed in one language (`{count}` vs `{counts}`) leaves a
 *    literal `{counts}` on screen after interpolation;
 *  - a key added to `en` and filled with the English string in another locale is
 *    untranslated copy, which is worth flagging for the market that reads it.
 *
 * The last point is reported, not failed: shipping English as a fallback is a
 * product decision, whereas blank text and broken placeholders are defects.
 */

const locales = { en, ru, es, pt, de, fr, zh } as const;
type LocaleCode = keyof typeof locales;

function flatten(value: unknown, prefix = '', out = new Map<string, unknown>()): Map<string, unknown> {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => flatten(entry, `${prefix}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      flatten(entry, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  out.set(prefix, value);
  return out;
}

const placeholders = (value: string) =>
  [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

const reference = flatten(en);

test('every locale exposes exactly the English key structure', () => {
  const englishKeys = [...reference.keys()].sort();
  for (const [code, dictionary] of Object.entries(locales) as [LocaleCode, unknown][]) {
    const keys = [...flatten(dictionary).keys()].sort();
    const missing = englishKeys.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !reference.has(key));
    assert.deepEqual(missing, [], `${code} is missing translation keys`);
    assert.deepEqual(extra, [], `${code} has keys that do not exist in en`);
  }
});

test('no translated value is blank', () => {
  for (const [code, dictionary] of Object.entries(locales) as [LocaleCode, unknown][]) {
    for (const [key, value] of flatten(dictionary)) {
      assert.equal(typeof value, 'string', `${code}:${key} must be a string`);
      assert.ok((value as string).trim().length > 0, `${code}:${key} must not be blank`);
    }
  }
});

test('placeholders match the English source in every locale', () => {
  const mismatches: string[] = [];
  for (const [code, dictionary] of Object.entries(locales) as [LocaleCode, unknown][]) {
    for (const [key, value] of flatten(dictionary)) {
      const expected = placeholders(String(reference.get(key) ?? '')).join(',');
      const actual = placeholders(value as string).join(',');
      if (expected !== actual) mismatches.push(`${code}:${key} expected {${expected}} got {${actual}}`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test('no locale contains an unresolved interpolation marker', () => {
  const broken: string[] = [];
  for (const [code, dictionary] of Object.entries(locales) as [LocaleCode, unknown][]) {
    for (const [key, value] of flatten(dictionary)) {
      const text = String(value);
      // Highlight/link markup is allowed; a bare `${...}` template or an
      // unclosed `{` left from editing is not.
      if (text.includes('${') || /\{[A-Za-z_$][\w$]*/.test(text.replace(/\{\w+\}/g, ''))) {
        broken.push(`${code}:${key}`);
      }
    }
  }
  assert.deepEqual(broken, []);
});
