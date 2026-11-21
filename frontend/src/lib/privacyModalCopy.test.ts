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

/**
 * Section 152. The privacy-policy window titled itself with a two-language branch
 * (`isRussian ? 'Политика конфиденциальности' : 'Privacy Policy'`), so a German or Chinese customer opening
 * it saw an English heading and an English "Close" on the button.
 *
 * The policy *text* genuinely exists only in Russian and English — that limitation is recorded, not hidden.
 * The chrome around it, however, is ordinary interface text and must be in the interface language.
 */

const TABLES: Record<string, any> = { en, ru, es, pt, de, fr, zh };
const LANGUAGES = Object.keys(TABLES);

test('the policy window has a title and a close label in every language', () => {
  const missing: string[] = [];
  for (const language of LANGUAGES) {
    for (const key of ['privacyPolicyTitle', 'closeLabel']) {
      const value = TABLES[language].terms[key];
      if (typeof value !== 'string' || !value.trim()) missing.push(`${language}.terms.${key}`);
    }
  }
  assert.deepEqual(missing, [], `missing:\n${missing.join('\n')}`);
});

test('no language other than Russian answers in Cyrillic', () => {
  const offenders: string[] = [];
  for (const language of LANGUAGES) {
    if (language === 'ru') continue;
    for (const key of ['privacyPolicyTitle', 'closeLabel']) {
      const value = TABLES[language].terms[key] as string;
      if (/[\u0410-\u044f\u0401\u0451]/.test(value)) offenders.push(`${language}.${key}: ${value}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('German and Chinese are not English', () => {
  assert.equal(TABLES.de.terms.privacyPolicyTitle, 'Datenschutzerklärung');
  assert.equal(TABLES.zh.terms.privacyPolicyTitle, '隐私政策');
  assert.notEqual(TABLES.es.terms.closeLabel, TABLES.en.terms.closeLabel);
});

test('the component chooses no language itself any more', () => {
  const source = readFileSync(path.join(process.cwd(), 'src', 'components', 'auth', 'PrivacyPolicyModal.tsx'), 'utf8');
  // Ветка выбора ТЕЛА политики (`isRussian ? policyRu : policyEn`) законна: текст существует только
  // на двух языках. Запрещена ветка, выбирающая интерфейсную СТРОКУ.
  assert.equal(source.includes("isRussian ? '"), false, 'a two-language string branch is back');
  assert.match(source, /t\.terms\.privacyPolicyTitle/);
  assert.match(source, /t\.terms\.closeLabel/);
});
