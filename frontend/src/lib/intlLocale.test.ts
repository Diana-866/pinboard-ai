import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { currencyForLanguage, formattingLocale } from './intlLocale';

/**
 * Section 142. Money and counts were formatted with `language === 'ru' ? 'ru-RU' : 'en-US'`, so five of the
 * seven supported languages were shown American formatting. The number is the message on a pricing screen,
 * so the check is not "a locale string exists" but "the digits actually come out in that language's shape".
 */

const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'] as const;

test('every supported language maps to its own locale', () => {
  const seen = new Map<string, string>();
  for (const language of LANGUAGES) {
    const locale = formattingLocale(language);
    assert.ok(locale.includes('-'), `${language}: ${locale} is not a regional locale`);
    assert.equal(seen.has(locale), false, `${language} shares ${locale} with ${seen.get(locale)}`);
    seen.set(locale, language);
  }
});

test('German, French and Spanish group digits differently from English', () => {
  const amount = 1990.5;
  const en = new Intl.NumberFormat(formattingLocale('en'), { minimumFractionDigits: 2 }).format(amount);
  const de = new Intl.NumberFormat(formattingLocale('de'), { minimumFractionDigits: 2 }).format(amount);
  const fr = new Intl.NumberFormat(formattingLocale('fr'), { minimumFractionDigits: 2 }).format(amount);
  const es = new Intl.NumberFormat(formattingLocale('es'), { minimumFractionDigits: 2 }).format(amount);
  assert.equal(en, '1,990.50');
  assert.notEqual(de, en, 'German formatting must not look American');
  assert.notEqual(fr, en, 'French formatting must not look American');
  assert.notEqual(es, en, 'Spanish formatting must not look American');
  // Немецкий и французский ставят запятую в дробной части, английский — точку.
  assert.match(de, /,\d{2}$/);
  assert.match(fr, /,\d{2}$/);
});

test('an unknown language falls back to English instead of throwing', () => {
  assert.equal(formattingLocale(undefined), 'en-US');
  assert.equal(formattingLocale(''), 'en-US');
  assert.equal(formattingLocale('xx'), 'en-US');
  assert.equal(formattingLocale('DE'), 'de-DE');
});

test('the currency a language pays in stays a separate decision', () => {
  assert.equal(currencyForLanguage('ru'), 'RUB');
  for (const language of ['en', 'es', 'pt', 'de', 'fr', 'zh'] as const) {
    assert.equal(currencyForLanguage(language), 'USD', language);
  }
});

test('no screen chooses between exactly two formatting locales any more', () => {
  const files = [
    'src/components/pricing/PricingView.tsx',
    'src/components/onboarding/OnboardingWizard.tsx',
    'src/pages/Contacts.tsx',
    'src/pages/Landing.tsx',
  ];
  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(path.join(process.cwd(), file), 'utf8');
    if (source.includes("'ru-RU' : 'en-US'")) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `files still branching on two locales:\n${offenders.join('\n')}`);
});
