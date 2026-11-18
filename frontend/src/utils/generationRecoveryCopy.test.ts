import test from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../i18n/locales/en';
import { ru } from '../i18n/locales/ru';
import { es } from '../i18n/locales/es';
import { pt } from '../i18n/locales/pt';
import { de } from '../i18n/locales/de';
import { fr } from '../i18n/locales/fr';
import { zh } from '../i18n/locales/zh';

const locales = { en, ru, es, pt, de, fr, zh };
const keys = ['recoveryChecking', 'recoveryTitle', 'recoveryCheckAgain', 'recoveryCheckingButton', 'recoveryDescription', 'recoveryCompletedTemplate', 'recoveryProcessing', 'recoveryFailed', 'recoveryNotFound', 'recoveryExpired', 'recoveryUnknown', 'recoveryOpenSavedPins', 'recoveryBoardUnavailable', 'recoveryDismiss'];

test('generation recovery copy exists in every supported locale', () => {
  for (const [locale, copy] of Object.entries(locales)) {
    for (const key of keys) {
      const value: unknown = copy.generator[key as keyof typeof copy.generator];
      assert.equal(typeof value, 'string', locale + ':' + key);
      assert.ok(typeof value === 'string' && value.trim().length > 0, locale + ':' + key);
    }
    assert.match(copy.generator.recoveryCompletedTemplate, /\{count\}/, locale);
  }
});
