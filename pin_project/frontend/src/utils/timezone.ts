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
    nameEn: 'UK / London (GMT / BST, UTC+0 / UTC+1)',
    nameRu: 'Великобритания / Лондон (GMT, UTC+0)',
    abbr: 'GMT',
    offsetHoursFromUtc: 0,
  },
  {
    value: 'Europe/Berlin',
    nameEn: 'Central Europe (Berlin, Paris, CET, UTC+1)',
    nameRu: 'Центральная Европа (Берлин, Париж, CET, UTC+1)',
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
    nameEn: 'Australia / Sydney (AEST, UTC+10)',
    nameRu: 'Австралия / Сидней (AEST, UTC+10)',
    abbr: 'AEST',
    offsetHoursFromUtc: 10,
  },
];

const TIMEZONE_STORAGE_KEY = 'pinposy_user_timezone';

export const getDefaultTimezone = (lang?: string): string => {
  try {
    const saved = localStorage.getItem(TIMEZONE_STORAGE_KEY);
    if (saved) return saved;

    if (lang === 'ru') return 'Europe/Moscow';

    // Auto-detect browser timezone
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) {
      const match = SUPPORTED_TIMEZONES.find((t) => t.value === detected);
      if (match) return match.value;
      if (detected.startsWith('America/')) return 'America/New_York';
      if (detected.startsWith('Europe/')) return 'Europe/London';
      if (detected.startsWith('Asia/')) return 'Asia/Singapore';
    }
  } catch {
    // ignore
  }

  return lang === 'ru' ? 'Europe/Moscow' : 'America/New_York';
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
export const getOffsetDiffMinutesToMoscow = (timeZone: string): number => {
  try {
    const now = new Date();
    // Get hours & minutes in Moscow
    const mskFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    // Get hours & minutes in target timezone
    const targetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const mskParts = mskFormatter.formatToParts(now);
    const targetParts = targetFormatter.formatToParts(now);

    const getVal = (parts: Intl.DateTimeFormatPart[], type: string) =>
      Number(parts.find((p) => p.type === type)?.value || '0');

    const mskDay = getVal(mskParts, 'day');
    const mskHour = getVal(mskParts, 'hour') % 24;
    const mskMin = getVal(mskParts, 'minute');

    const targetDay = getVal(targetParts, 'day');
    const targetHour = getVal(targetParts, 'hour') % 24;
    const targetMin = getVal(targetParts, 'minute');

    const mskTotalMinutes = (mskDay * 24 + mskHour) * 60 + mskMin;
    const targetTotalMinutes = (targetDay * 24 + targetHour) * 60 + targetMin;

    return mskTotalMinutes - targetTotalMinutes;
  } catch {
    // Fallback: estimate from standard offsets
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
  return (
    SUPPORTED_TIMEZONES.find((t) => t.value === timeZone) || {
      value: timeZone,
      nameEn: timeZone,
      nameRu: timeZone,
      abbr: timeZone.includes('Moscow') ? 'МСК' : 'Local',
      offsetHoursFromUtc: 3,
    }
  );
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
