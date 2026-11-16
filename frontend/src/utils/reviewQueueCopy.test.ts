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
      copy.review.demoPinCannotSchedule,
      copy.review.connectPinterestFirst,
      copy.review.savedPinQueueSyncError,
      copy.review.scheduleCreateError,
      copy.review.rejectSaveError,
      copy.review.rejectQueueSyncError,
      copy.review.bulkDemoQueueCannotSchedule,
      copy.review.bulkQueueSyncError,
      copy.review.bulkSchedulePartialTemplate,
      copy.review.imageReplaceRequiresSavedPin,
      copy.review.regenerationKeyError,
      copy.review.regenerationSending,
      copy.review.regenerationPending,
      copy.review.regenerationUnconfirmed,
      copy.review.regenerationSaved,
      copy.review.regenerationRetry,
      copy.review.regenerationFailed,
      copy.review.imageReplaceFailed,
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
    assert.match(copy.review.bulkSchedulePartialTemplate, /\\{saved\\}/, locale);
    assert.match(copy.review.bulkSchedulePartialTemplate, /\\{total\\}/, locale);
  }
});
