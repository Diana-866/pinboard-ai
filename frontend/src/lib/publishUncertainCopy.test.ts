import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { en } from '../i18n/locales/en';
import { ru } from '../i18n/locales/ru';
import { es } from '../i18n/locales/es';
import { pt } from '../i18n/locales/pt';
import { de } from '../i18n/locales/de';
import { fr } from '../i18n/locales/fr';
import { zh } from '../i18n/locales/zh';

/**
 * Section 131. After a publish request whose outcome is unknown, the button showed a hardcoded Russian
 * sentence - "Pinterest мог создать пин…" - while every other line in that component came from the
 * translation table. A German or Chinese customer received the most consequential message of the whole
 * flow in a language they may not read, and it is the message that tells them not to press the button
 * again.
 */
const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'] as const;
const tables: Record<string, any> = { en, ru, es, pt, de, fr, zh };

test('the uncertain-publish warning exists in every language', () => {
  for (const language of LANGUAGES) {
    const copy = tables[language]?.publishing?.publishUncertain;
    assert.equal(typeof copy, 'string', `${language} must define publishing.publishUncertain`);
    assert.ok(copy.trim().length > 20, `${language} must say something real`);
  }
  const english = tables.en.publishing.publishUncertain as string;
  assert.match(english, /may have created|possibly/i, 'the uncertainty has to be stated');
  assert.match(english, /do not send it again/i, 'the one instruction that matters');
  const russian = tables.ru.publishing.publishUncertain as string;
  assert.match(russian, /не отправляйте/i);
});

test('every language keeps the one instruction that matters', () => {
  // The sentence exists to stop a second POST. A translation that only says "it may have worked"
  // leaves the customer exactly where they started - and a shortened string still passes a length check.
  const doNotResend: Record<string, RegExp> = {
    en: /do not send it again/i,
    ru: /не отправляйте/i,
    es: /no lo env[íi]es/i,
    pt: /n[ãa]o envie/i,
    de: /nicht erneut/i,
    fr: /pas de nouveau/i,
    zh: /请勿再次发送|不要再次/,
  };
  for (const language of LANGUAGES) {
    const copy = tables[language].publishing.publishUncertain as string;
    assert.match(copy, doNotResend[language], `${language} must tell the customer not to resend`);
  }
});

test('no language received the Russian sentence by copy-paste', () => {
  // The failure mode of a rushed translation is an untranslated placeholder left in place.
  for (const language of LANGUAGES.filter((code) => code !== 'ru')) {
    const copy = tables[language].publishing.publishUncertain as string;
    assert.doesNotMatch(copy, /[А-Яа-яЁё]/, `${language} still contains Cyrillic text`);
  }
});

test('the component reads the translation instead of carrying its own sentence', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'pins', 'PublishPinButton.tsx'),
    'utf8'
  ).replace(/\r\n/g, '\n');
  assert.match(source, /t\.publishing\.publishUncertain/);
  assert.doesNotMatch(source, /[А-Яа-яЁё]{4,}/, 'the button must not carry its own Russian sentence');
});
