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

test('calendar recovery, loading and retry copy exists in every supported locale', () => {
  for (const [locale, copy] of Object.entries(locales)) {
    for (const value of [
      copy.calendar.replacementBoardsEmpty,
      copy.calendar.replacementBoardsLoadError,
      copy.calendar.noFutureSlot,
      copy.calendar.slotTopicRequired,
      copy.calendar.slotBoardRequired,
      copy.calendar.scheduleLoading,
      copy.calendar.scheduleRetry,
      copy.calendar.scheduleLoadUnavailable,
      copy.calendar.boardUnavailableTitle,
      copy.calendar.boardUnavailableDescription,
      copy.calendar.chooseReplacementBoardTitle,
      copy.calendar.replacementBoardLoading,
      copy.calendar.replacementBoardNoneAvailable,
      copy.calendar.replacementBoardSelectPlaceholder,
      copy.calendar.currentBoardSuffix,
      copy.calendar.replacementBoardSaving,
      copy.calendar.replacementBoardResume,
      copy.calendar.retrying,
      copy.calendar.cancelling,
    ]) {
      assert.equal(typeof value, 'string', locale);
      assert.ok(value.trim().length > 0, locale);
    }
  }
});
