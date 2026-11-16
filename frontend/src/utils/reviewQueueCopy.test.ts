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

test('review queue and saved-pin status copy exists in every supported locale', () => {
  for (const [locale, copy] of Object.entries(locales)) {
    for (const value of [
      copy.review.queueDescription,
      copy.review.queueCountTemplate,
      copy.generator.savedPinsLoading,
      copy.generator.savedPinsRetry,
      copy.generator.savedPinsLoadError,
      copy.generator.addToReviewBtn,
      copy.generator.addToReviewSaving,
      copy.generator.addToReviewSuccess,
    ]) {
      assert.equal(typeof value, 'string', locale);
      assert.ok(value.trim().length > 0, locale);
    }
    assert.match(copy.review.queueCountTemplate, /\\{count\\}/, locale);
  }
});
