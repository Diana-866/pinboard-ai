import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_TIMEZONES } from './timezone';
import { TIMEZONE_NAME_LANGUAGES, missingTimezoneNames, timezoneDisplayName } from './timezoneNames';

/**
 * Section 136. The timezone list was localized for exactly two languages: `language === 'ru' ? nameRu :
 * nameEn`, so every other customer chose their timezone reading English. A language missing from this
 * table must be a test failure, not a silent English fallback.
 */

test('every supported zone has a name of its own in every supported language', () => {
  const gaps: string[] = [];
  for (const zone of SUPPORTED_TIMEZONES) {
    const missing = missingTimezoneNames(zone);
    if (missing.length > 0) gaps.push(`${zone.value}: ${missing.join(', ')}`);
  }
  assert.deepEqual(gaps, [], `zones without a name:\n${gaps.join('\n')}`);
});

test('a zone added without translations is reported, not hidden behind the English fallback', () => {
  // Иначе новый пояс получил бы английское имя во всех языках, и никто бы этого не заметил.
  const later = { value: 'Europe/Lisbon', nameEn: 'Portugal / Lisbon', nameRu: 'Португалия / Лиссабон' };
  assert.deepEqual(missingTimezoneNames(later), ['es', 'pt', 'de', 'fr', 'zh']);
  // А поддерживаемые пояса — без пробелов.
  for (const zone of SUPPORTED_TIMEZONES) assert.deepEqual(missingTimezoneNames(zone), [], zone.value);
});

test('Russian and English keep their own names', () => {
  const moscow = SUPPORTED_TIMEZONES.find((zone) => zone.value === 'Europe/Moscow');
  assert.ok(moscow);
  assert.equal(timezoneDisplayName(moscow, 'ru'), moscow.nameRu);
  assert.equal(timezoneDisplayName(moscow, 'en'), moscow.nameEn);
  assert.match(timezoneDisplayName(moscow, 'ru'), /Москва/);
});

test('Spanish, Portuguese, German, French and Chinese are not English', () => {
  const tokyo = SUPPORTED_TIMEZONES.find((zone) => zone.value === 'Asia/Tokyo');
  assert.ok(tokyo);
  const failures: string[] = [];
  for (const language of ['es', 'pt', 'de', 'fr', 'zh'] as const) {
    const name = timezoneDisplayName(tokyo, language);
    if (name === tokyo.nameEn) failures.push(`${language} fell back to English`);
    if (!name.trim()) failures.push(`${language} is empty`);
  }
  assert.deepEqual(failures, [], failures.join('\n'));
  assert.equal(timezoneDisplayName(tokyo, 'zh'), '日本 / 东京（JST，UTC+9）');
  assert.equal(timezoneDisplayName(tokyo, 'de'), 'Japan / Tokio (JST, UTC+9)');
});

test('no language other than Russian receives Cyrillic names', () => {
  const offenders: string[] = [];
  for (const zone of SUPPORTED_TIMEZONES) {
    for (const language of TIMEZONE_NAME_LANGUAGES) {
      if (language === 'ru') continue;
      const name = timezoneDisplayName(zone, language);
      if (/[\u0410-\u044f\u0401\u0451]/.test(name)) offenders.push(`${language}/${zone.value}: ${name}`);
    }
  }
  assert.deepEqual(offenders, [], `Cyrillic outside Russian:\n${offenders.join('\n')}`);
});

test('an unknown zone falls back to the name it carries instead of becoming empty', () => {
  const custom = { value: 'Europe/Lisbon', nameEn: 'Portugal / Lisbon', nameRu: 'Португалия / Лиссабон' };
  assert.equal(timezoneDisplayName(custom, 'es'), 'Portugal / Lisbon');
  assert.equal(timezoneDisplayName(custom, 'ru'), 'Португалия / Лиссабон');
  assert.equal(timezoneDisplayName(custom, 'xx'), 'Portugal / Lisbon');
  assert.equal(timezoneDisplayName(custom, ''), 'Portugal / Lisbon');
});
