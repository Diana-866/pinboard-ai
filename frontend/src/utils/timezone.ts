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

/** Accept only real IANA timezone identifiers before they enter scheduling state. */
export const isValidIanaTimezone = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).format(0);
    return true;
  } catch {
    return false;
  }
};

export const getDefaultTimezone = (lang?: string): string => {
  try {
    const saved = localStorage.getItem(TIMEZONE_STORAGE_KEY);
    if (saved) {
      if (isValidIanaTimezone(saved)) return saved.trim();
      // A stale or manually edited browser preference must not break the calendar.
      localStorage.removeItem(TIMEZONE_STORAGE_KEY);
    }

    // Preserve the browser's exact IANA timezone. Region-level fallbacks
    // (for example, mapping every European city to London) shift local times.
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidIanaTimezone(detected)) return detected;
  } catch {
    // ignore unavailable storage or Intl runtime errors
  }

  return lang === 'ru' ? 'Europe/Moscow' : 'Etc/UTC';
};

export const saveUserTimezone = (tz: string) => {
  if (!isValidIanaTimezone(tz)) return;
  try {
    localStorage.setItem(TIMEZONE_STORAGE_KEY, tz.trim());
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


/**
 * Convert a wall-clock date/time in an IANA timezone to an absolute instant.
 * The offset is calculated for the requested date (not today's DST offset).
 * Non-existent local times during the spring-forward gap are rejected.
 */
export const localDateTimeToDate = (date: string, time: string, timeZone: string): Date => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) throw new Error('Invalid local date or time');

  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const parts = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const [year, month, day, hour, minute] = parts;
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute);
  const checkDate = new Date(wallClockUtc);
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) throw new Error('Invalid local date or time');

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const getOffset = (instant: number): number => {
    const values = formatter.formatToParts(new Date(instant));
    const value = (type: string) => Number(values.find((part) => part.type === type)?.value || 0);
    const representedAsUtc = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      value('hour'),
      value('minute')
    );
    return representedAsUtc - Math.floor(instant / 60000) * 60000;
  };

  let candidate = wallClockUtc - getOffset(wallClockUtc);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = wallClockUtc - getOffset(candidate);
    if (next === candidate) break;
    candidate = next;
  }

  const actual = formatter.formatToParts(new Date(candidate));
  const value = (type: string) => Number(actual.find((part) => part.type === type)?.value || 0);
  if (
    value('year') !== year ||
    value('month') !== month ||
    value('day') !== day ||
    value('hour') !== hour ||
    value('minute') !== minute
  ) throw new Error('This local time does not exist because of a daylight-saving-time transition');

  return new Date(candidate);
};

/** Add calendar days in an IANA timezone without relying on the browser's timezone or fixed 24-hour durations. */
export const addCalendarDaysInTimezone = (instant: Date, timeZone: string, days: number): string => {
  if (!Number.isFinite(instant.getTime()) || !Number.isInteger(days)) {
    throw new Error('Invalid instant or calendar-day offset');
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const calendarDate = new Date(Date.UTC(value('year'), value('month') - 1, value('day') + days));
  return [
    calendarDate.getUTCFullYear().toString().padStart(4, '0'),
    String(calendarDate.getUTCMonth() + 1).padStart(2, '0'),
    String(calendarDate.getUTCDate()).padStart(2, '0'),
  ].join('-');
};

/** Format an instant as a date/time pair in the selected IANA timezone. */
export const formatInstantInTimezone = (instant: Date, timeZone: string): { date: string; time: string } => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  };
};

/** Build a Sunday-first six-week month grid using the selected timezone's current month. */
export const getCalendarMonthGrid = (
  instant: Date,
  timeZone: string
): Array<{ dateStr: string; dayNumber: number; isCurrentMonth: boolean }> => {
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid instant');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const year = value('year');
  const month = value('month');
  if (!year || month < 1 || month > 12) throw new Error('Invalid calendar month');

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - firstOfMonth.getUTCDay()));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(
      gridStart.getUTCFullYear(),
      gridStart.getUTCMonth(),
      gridStart.getUTCDate() + index
    ));
    return {
      dateStr: [
        date.getUTCFullYear().toString().padStart(4, '0'),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0'),
      ].join('-'),
      dayNumber: date.getUTCDate(),
      isCurrentMonth: date.getUTCFullYear() === year && date.getUTCMonth() === month - 1,
    };
  });
};


/**
 * Pick a valid future wall-clock slot for the calendar quick-add action.
 * If the default time has already passed today, advance to the next
 * quarter-hour with enough lead time for the user to finish the form.
 */
export const resolveScheduleSlotTime = (
  date: string,
  timeZone: string,
  defaultTime = '20:15',
  now: Date = new Date(),
): string => {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || !isValidIanaTimezone(timeZone) || !Number.isFinite(now.getTime())) {
    throw new Error('Invalid schedule slot');
  }

  const today = formatInstantInTimezone(now, timeZone);
  if (date < today.date) throw new Error('Cannot schedule a publication in the past');

  const parseMinutes = (value: string): number => {
    const match = /^(\\d{2}):(\\d{2})$/.exec(value);
    if (!match) throw new Error('Invalid schedule time');
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) throw new Error('Invalid schedule time');
    return hour * 60 + minute;
  };
  const formatMinutes = (value: number): string =>
    `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  const minimumInstant = now.getTime() + 10 * 60 * 1000;

  let startMinutes = parseMinutes(defaultTime);
  if (date === today.date) {
    const nowMinutes = parseMinutes(today.time);
    const defaultCandidate = (() => {
      try { return localDateTimeToDate(date, defaultTime, timeZone).getTime(); }
      catch { return Number.NaN; }
    })();
    if (defaultCandidate > minimumInstant) return defaultTime;
    startMinutes = Math.ceil((nowMinutes + 15) / 15) * 15;
  }

  for (let minutes = startMinutes; minutes < 24 * 60; minutes += 15) {
    const candidateTime = formatMinutes(minutes);
    try {
      if (localDateTimeToDate(date, candidateTime, timeZone).getTime() > minimumInstant) {
        return candidateTime;
      }
    } catch {
      // Skip nonexistent wall-clock times during a daylight-saving transition.
    }
  }

  throw new Error('No future schedule slot remains on this date');
};
