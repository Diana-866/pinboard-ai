// Timezone Utilities for PinPosy
// Supports localized user time and transparent Russian server execution (MSK, UTC+3)

export interface TimezoneOption {
  value: string;
  nameEn: string;
  nameRu: string;
  abbr: string;
  offsetHoursFromUtc: number; // Standard offset
}

export const SUPPORTED_TIMEZONES: TimezoneOption[] = [
  {
    value: 'Europe/Moscow',
    nameEn: 'Moscow (MSK, UTC+3)',
    nameRu: 'Москва (МСК, UTC+3)',
    abbr: 'МСК',
    offsetHoursFromUtc: 3,
  },
  {
    value: 'America/New_York',
    nameEn: 'US Eastern Time (New York, Miami, EST/EDT)',
    nameRu: 'США — Восточное время (Нью-Йорк, Майами)',
    abbr: 'EST',
    offsetHoursFromUtc: -5,
  },
  {
    value: 'America/Chicago',
    nameEn: 'US Central Time (Chicago, Dallas, CST/CDT)',
    nameRu: 'США — Центральное время (Чикаго, Даллас)',
    abbr: 'CST',
    offsetHoursFromUtc: -6,
  },
  {
    value: 'America/Denver',
    nameEn: 'US Mountain Time (Denver, Phoenix, MST/MDT)',
    nameRu: 'США — Горное время (Денвер, Финикс)',
    abbr: 'MST',
    offsetHoursFromUtc: -7,
  },
  {
    value: 'America/Los_Angeles',
    nameEn: 'US Pacific Time (Los Angeles, Seattle, PST/PDT)',
    nameRu: 'США — Тихоокеанское время (Лос-Анджелес, Сан-Франциско)',
    abbr: 'PST',
    offsetHoursFromUtc: -8,
  },
  {
    value: 'Europe/London',
    nameEn: 'UK / London',
    nameRu: 'Великобритания / Лондон',
    abbr: 'GMT',
    offsetHoursFromUtc: 0,
  },
  {
    value: 'Europe/Berlin',
    nameEn: 'Central Europe (Berlin, Paris)',
    nameRu: 'Центральная Европа (Берлин, Париж)',
    abbr: 'CET',
    offsetHoursFromUtc: 1,
  },
  {
    value: 'Asia/Dubai',
    nameEn: 'Gulf Standard Time (Dubai, GST, UTC+4)',
    nameRu: 'ОАЭ / Дубай (GST, UTC+4)',
    abbr: 'GST',
    offsetHoursFromUtc: 4,
  },
  {
    value: 'Asia/Singapore',
    nameEn: 'Singapore / Hong Kong (SGT, UTC+8)',
    nameRu: 'Сингапур / Гонконг (SGT, UTC+8)',
    abbr: 'SGT',
    offsetHoursFromUtc: 8,
  },
  {
    value: 'Asia/Tokyo',
    nameEn: 'Japan / Tokyo (JST, UTC+9)',
    nameRu: 'Япония / Токио (JST, UTC+9)',
    abbr: 'JST',
    offsetHoursFromUtc: 9,
  },
  {
    value: 'Australia/Sydney',
    nameEn: 'Australia / Sydney',
    nameRu: 'Австралия / Сидней',
    abbr: 'AEST',
    offsetHoursFromUtc: 10,
  },
];

const TIMEZONE_STORAGE_KEY = 'pinposy_user_timezone';

export const getDefaultTimezone = (lang?: string): string => {
  try {
    const saved = localStorage.getItem(TIMEZONE_STORAGE_KEY);
    if (saved) return saved;

    // Preserve the browser's exact IANA timezone. Region-level fallbacks
    // (for example, mapping every European city to London) shift local times.
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) return detected;
  } catch {
    // ignore
  }

  return lang === 'ru' ? 'Europe/Moscow' : 'Etc/UTC';
};

export const saveUserTimezone = (tz: string) => {
  try {
    localStorage.setItem(TIMEZONE_STORAGE_KEY, tz);
  } catch {
    // ignore
  }
};

/**
 * Calculates current real offset difference in minutes between any timezone and Moscow (UTC+3)
 */
export const getOffsetDiffMinutesToMoscow = (timeZone: string, instant: Date = new Date()): number => {
  try {
    const getWallClockMinutes = (zone: string) => {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(instant);
      const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
      return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute')) / 60000;
    };

    // Compare complete calendar dates, not only day-of-month. This remains
    // correct across month/year boundaries and uses each zone's current DST offset.
    return getWallClockMinutes('Europe/Moscow') - getWallClockMinutes(timeZone);
  } catch {
    const opt = SUPPORTED_TIMEZONES.find((t) => t.value === timeZone);
    const targetOffset = opt ? opt.offsetHoursFromUtc : 3;
    return (3 - targetOffset) * 60;
  }
};

/**
 * Converts a HH:mm string from the user's timezone into Moscow server time (HH:mm)
 */
export const convertLocalToMoscow = (timeStr: string, timeZone: string): string => {
  if (!timeStr || timeZone === 'Europe/Moscow') return timeStr || '01:00';

  const [hours, minutes] = (timeStr || '01:00').split(':').map(Number);
  const diffMinutes = getOffsetDiffMinutesToMoscow(timeZone);

  let totalMinutes = (hours * 60 + minutes + diffMinutes) % (24 * 60);
  if (totalMinutes < 0) totalMinutes += 24 * 60;

  const mskHour = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const mskMinute = (totalMinutes % 60).toString().padStart(2, '0');

  return `${mskHour}:${mskMinute}`;
};

/**
 * Converts a HH:mm string from Moscow server time into user's local timezone (HH:mm)
 */
export const convertMoscowToLocal = (timeStr: string, timeZone: string): string => {
  if (!timeStr || timeZone === 'Europe/Moscow') return timeStr || '01:00';

  const [hours, minutes] = (timeStr || '01:00').split(':').map(Number);
  const diffMinutes = getOffsetDiffMinutesToMoscow(timeZone);

  let totalMinutes = (hours * 60 + minutes - diffMinutes) % (24 * 60);
  if (totalMinutes < 0) totalMinutes += 24 * 60;

  const localHour = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const localMinute = (totalMinutes % 60).toString().padStart(2, '0');

  return `${localHour}:${localMinute}`;
};

export const getTimezoneInfo = (timeZone: string) => {
  const known = SUPPORTED_TIMEZONES.find((t) => t.value === timeZone);
  try {
    const abbreviation = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value;

    if (known) return { ...known, abbr: abbreviation || known.abbr };
    return {
      value: timeZone,
      nameEn: timeZone,
      nameRu: timeZone,
      abbr: abbreviation || timeZone,
      offsetHoursFromUtc: 0,
    };
  } catch {
    return known || {
      value: timeZone,
      nameEn: timeZone,
      nameRu: timeZone,
      abbr: timeZone.includes('Moscow') ? 'MSK' : timeZone,
      offsetHoursFromUtc: 0,
    };
  }
};

/**
 * Returns formatted labels for both Russian and international audiences.
 * - Russian user: "01:00 МСК"
 * - International user: "01:00 EST (09:00 MSK на сервере)"
 */
export const formatTimeDisplay = (
  timeStr: string,
  timeZone: string,
  language: string
): {
  displayText: string;
  badgeText: string;
  serverText: string;
  descriptionText: string;
} => {
  const cleanTime = timeStr || '01:00';
  const isMsk = timeZone === 'Europe/Moscow';
  const tzInfo = getTimezoneInfo(timeZone);
  const mskServerTime = convertLocalToMoscow(cleanTime, timeZone);

  if (isMsk || language === 'ru' && isMsk) {
    return {
      displayText: `${cleanTime} МСК`,
      badgeText: `${cleanTime} МСК`,
      serverText: `${cleanTime} МСК`,
      descriptionText:
        language === 'ru'
          ? `Автогенерация запускается в ${cleanTime} по московскому времени.`
          : `Auto-generation runs daily at ${cleanTime} MSK.`,
    };
  }

  // Non-Moscow timezone (e.g. American user on EST / PST)
  const isRussianLang = language === 'ru';
  return {
    displayText: `${cleanTime} ${tzInfo.abbr} (${mskServerTime} МСК)`,
    badgeText: `${cleanTime} ${tzInfo.abbr}`,
    serverText: `${mskServerTime} MSK`,
    descriptionText: isRussianLang
      ? `Генерация запускается в ${cleanTime} по вашему времени (${tzInfo.abbr}), что соответствует ${mskServerTime} МСК на серверах PinPosy.`
      : `Executes at ${cleanTime} in your local timezone (${tzInfo.abbr}). Synced to ${mskServerTime} MSK on Russian PinPosy servers.`,
  };
};
