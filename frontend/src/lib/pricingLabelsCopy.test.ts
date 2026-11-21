import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { en } from '../i18n/locales/en';
import { ru } from '../i18n/locales/ru';
import { es } from '../i18n/locales/es';
import { pt } from '../i18n/locales/pt';
import { de } from '../i18n/locales/de';
import { fr } from '../i18n/locales/fr';
import { zh } from '../i18n/locales/zh';

const LOCALE_TABLES = { en, ru, es, pt, de, fr, zh };

/**
 * Section 138. The pricing screen showed its money labels in Russian to everyone: `'/ мес'` as the period,
 * `'до 3'`/`'до 10'`/`'безлимит*'` as the account limit, and pack names `'Пакет S/M/L'`, with a two-language
 * branch for the "best value" badge. On a page whose whole job is to state a price, five of seven languages
 * read a language they do not speak.
 *
 * Two things are checked here: that every language has these labels, and that the placeholder the component
 * substitutes is still present - a locale that drops `{count}` would render "up to" with no number at all.
 */

const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'] as const;

/** A period label is short, but it must say "per month" in its own language. */
const PERIOD: Record<string, RegExp> = {
  en: /\/\s*mo/i,
  ru: /\/\s*мес/i,
  es: /\/\s*mes/i,
  pt: /\/\s*m[êe]s/i,
  de: /\/\s*mon/i,
  fr: /\/\s*mois/i,
  zh: /月/,
};

function pricing(language: string) {
  return (LOCALE_TABLES as Record<string, any>)[language].pricing as Record<string, string>;
}

test('every language states the period, the pack names and the account limit', () => {
  const keys = ['perMonth', 'packS', 'packM', 'packL', 'accountsUpTo', 'accountsUnlimited', 'bestValue'];
  const missing: string[] = [];
  for (const language of LANGUAGES) {
    const table = pricing(language);
    for (const key of keys) {
      const value = table[key];
      if (typeof value !== 'string' || !value.trim()) missing.push(`${language}.${key}`);
    }
  }
  assert.deepEqual(missing, [], `pricing labels missing:\n${missing.join('\n')}`);
});

test('the period says "per month" in each language', () => {
  for (const language of LANGUAGES) {
    const value = pricing(language).perMonth;
    assert.match(value, PERIOD[language], `${language}: "${value}"`);
  }
});

test('the account limit keeps its placeholder, or the number disappears', () => {
  // Компонент подставляет число через replace('{count}', ...): локаль без плейсхолдера
  // показала бы «до» без числа на ценовом экране.
  for (const language of LANGUAGES) {
    assert.match(pricing(language).accountsUpTo, /\{count\}/, `${language} lost the placeholder`);
  }
});

test('no language other than Russian answers in Cyrillic', () => {
  const offenders: string[] = [];
  for (const language of LANGUAGES) {
    if (language === 'ru') continue;
    for (const key of ['perMonth', 'packS', 'packM', 'packL', 'accountsUpTo', 'accountsUnlimited', 'bestValue']) {
      const value = pricing(language)[key];
      if (/[\u0410-\u044f\u0401\u0451]/.test(value)) offenders.push(`${language}.${key}: ${value}`);
    }
  }
  assert.deepEqual(offenders, [], `Cyrillic outside Russian:\n${offenders.join('\n')}`);
});

test('the pricing component no longer carries these labels as literals', () => {
  const source = readFileSync(path.join(process.cwd(), 'src', 'components', 'pricing', 'PricingView.tsx'), 'utf8');
  for (const literal of ["'/ мес'", "'до 3'", "'до 10'", "'безлимит*'", "'Пакет S'", "'Пакет M'", "'Пакет L'", "'Выгодно'"]) {
    assert.equal(source.includes(literal), false, `PricingView still hardcodes ${literal}`);
  }
});

test('the purchase history speaks every language, without a two-language branch', () => {
  // Двухъязычные ветки `language === 'ru' ? … : …` отдавали английский пяти языкам (§139).
  const keys = ['loadTariffsError', 'loadPacksError', 'loadHistoryError', 'historyLoading', 'retry', 'emptyHistory', 'orderLabel', 'demoLabel'];
  const problems: string[] = [];
  for (const language of LANGUAGES) {
    for (const key of keys) {
      const value = (LOCALE_TABLES as Record<string, any>)[language].purchases[key];
      if (typeof value !== 'string' || !value.trim()) problems.push(`${language}.purchases.${key} missing`);
      else if (language !== 'ru' && /[А-яЁё]/.test(value)) problems.push(`${language}.purchases.${key}: ${value}`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the purchase history copy is no longer chosen between two languages in the component', () => {
  const source = readFileSync(path.join(process.cwd(), 'src', 'components', 'pricing', 'PricingView.tsx'), 'utf8');
  for (const literal of ["'Загружаем историю покупок…'", "'Повторить'", "'Демонстрация'", "'Заказ'", "'Не удалось загрузить историю покупок."]) {
    assert.equal(source.includes(literal), false, `PricingView still hardcodes ${literal}`);
  }
});
