import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarDaysInTimezone,
  formatInstantInTimezone,
  getCalendarMonthGrid,
  getDefaultTimezone,
  isValidIanaTimezone,
  localDateTimeToDate,
  saveUserTimezone,
  resolveScheduleSlotTime,
  validateScheduleInstant,
} from './timezone';

function withMockStorage(run: (values: Map<string, string>) => void) {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    run(values);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('accepts valid IANA zones and rejects malformed timezone values', () => {
  assert.equal(isValidIanaTimezone('Europe/London'), true);
  assert.equal(isValidIanaTimezone('America/Los_Angeles'), true);
  assert.equal(isValidIanaTimezone(''), false);
  assert.equal(isValidIanaTimezone('   '), false);
  assert.equal(isValidIanaTimezone('Not/A_Timezone'), false);
  assert.equal(isValidIanaTimezone(null), false);
  assert.equal(isValidIanaTimezone(42), false);
});

test('ignores and clears a corrupted saved timezone preference', () => {
  withMockStorage((values) => {
    values.set('pinposy_user_timezone', 'Not/A_Timezone');
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    assert.equal(getDefaultTimezone('en'), detected);
    assert.equal(values.has('pinposy_user_timezone'), false);
  });
});

test('does not persist invalid timezone values and normalizes valid ones', () => {
  withMockStorage((values) => {
    saveUserTimezone('Not/A_Timezone');
    assert.equal(values.has('pinposy_user_timezone'), false);
    saveUserTimezone(' Europe/London ');
    assert.equal(values.get('pinposy_user_timezone'), 'Europe/London');
    assert.equal(getDefaultTimezone(), 'Europe/London');
  });
});

test('converts scheduled wall-clock times using the target date DST offset', () => {
  const winter = localDateTimeToDate('2026-01-15', '09:00', 'Europe/London');
  const summer = localDateTimeToDate('2026-07-15', '09:00', 'Europe/London');
  assert.equal(winter.toISOString(), '2026-01-15T09:00:00.000Z');
  assert.equal(summer.toISOString(), '2026-07-15T08:00:00.000Z');
  assert.deepEqual(
    formatInstantInTimezone(summer, 'Europe/London'),
    { date: '2026-07-15', time: '09:00' },
  );
});

test('formats publish-now date and time as a 24-hour pair in the selected timezone', () => {
  const instant = new Date('2026-01-15T00:05:00.000Z');
  assert.deepEqual(formatInstantInTimezone(instant, 'Europe/London'), {
    date: '2026-01-15',
    time: '00:05',
  });
  assert.deepEqual(formatInstantInTimezone(instant, 'America/New_York'), {
    date: '2026-01-14',
    time: '19:05',
  });
});

test('rejects a local time that does not exist during the spring DST transition', () => {
  assert.throws(
    () => localDateTimeToDate('2026-03-29', '01:30', 'Europe/London'),
    /daylight-saving-time transition/,
  );
});

test('adds calendar days in the selected timezone across date and DST boundaries', () => {
  // The browser/runtime timezone is irrelevant: the result is the next calendar
  // day for the user's selected region, even when the UTC date is different.
  assert.equal(addCalendarDaysInTimezone(new Date('2026-01-01T23:30:00.000Z'), 'Europe/London', 1), '2026-01-02');
  assert.equal(addCalendarDaysInTimezone(new Date('2026-01-01T23:30:00.000Z'), 'America/Los_Angeles', 1), '2026-01-02');
  assert.equal(addCalendarDaysInTimezone(new Date('2026-03-28T12:00:00.000Z'), 'Europe/London', 1), '2026-03-29');
  assert.equal(addCalendarDaysInTimezone(new Date('2026-12-31T12:00:00.000Z'), 'Europe/Moscow', 1), '2027-01-01');
  assert.equal(addCalendarDaysInTimezone(new Date('2026-01-01T12:00:00.000Z'), 'Europe/Moscow', -1), '2025-12-31');
  assert.throws(() => addCalendarDaysInTimezone(new Date('invalid'), 'Europe/London', 1), /Invalid instant/);
  assert.throws(() => addCalendarDaysInTimezone(new Date(), 'Europe/London', 1.5), /Invalid instant/);
});

test('builds a Sunday-first six-week grid for the selected timezone month', () => {
  const grid = getCalendarMonthGrid(new Date('2026-11-01T12:00:00.000Z'), 'Europe/London');
  assert.equal(grid.length, 42);
  assert.equal(grid[0].dateStr, '2026-11-01');
  assert.equal(grid[0].dayNumber, 1);
  assert.equal(grid[0].isCurrentMonth, true);
  assert.equal(grid[41].dateStr, '2026-12-12');
  assert.equal(grid[41].isCurrentMonth, false);
});

test('aligns months that start mid-week and includes leap day', () => {
  const february = getCalendarMonthGrid(new Date('2028-02-15T12:00:00.000Z'), 'Europe/Moscow');
  assert.equal(february[0].dateStr, '2028-01-30');
  assert.equal(february[0].isCurrentMonth, false);
  assert.equal(february[2].dateStr, '2028-02-01');
  assert.equal(february[2].isCurrentMonth, true);
  assert.equal(february[30].dateStr, '2028-02-29');
  assert.equal(february[30].isCurrentMonth, true);
  assert.equal(february[31].dateStr, '2028-03-01');
  assert.equal(february[31].isCurrentMonth, false);
});

test('chooses the displayed month from the selected timezone, not UTC month', () => {
  const instant = new Date('2026-11-01T00:30:00.000Z');
  const london = getCalendarMonthGrid(instant, 'Europe/London');
  const losAngeles = getCalendarMonthGrid(instant, 'America/Los_Angeles');
  assert.equal(london.find((day) => day.isCurrentMonth)?.dateStr, '2026-11-01');
  assert.equal(losAngeles.find((day) => day.isCurrentMonth)?.dateStr, '2026-10-01');
});


test('calendar quick-add advances the default time when today\'s slot has passed', () => {
  const now = new Date('2026-11-11T21:00:00.000Z');
  assert.equal(resolveScheduleSlotTime('2026-11-11', 'Etc/UTC', '20:15', now), '21:15');
  assert.equal(resolveScheduleSlotTime('2026-11-12', 'Etc/UTC', '20:15', now), '20:15');
});

test('calendar quick-add rejects past dates and dates with no remaining future slot', () => {
  const now = new Date('2026-11-11T23:50:00.000Z');
  assert.throws(() => resolveScheduleSlotTime('2026-11-10', 'Etc/UTC', '20:15', now), /past/);
  assert.throws(() => resolveScheduleSlotTime('2026-11-11', 'Etc/UTC', '20:15', now), /No future schedule slot/);
});

test('calendar quick-add skips nonexistent daylight-saving wall-clock times', () => {
  const now = new Date('2026-03-28T12:00:00.000Z');
  assert.equal(resolveScheduleSlotTime('2026-03-29', 'Europe/London', '01:30', now), '02:00');
});

test('schedule validation mirrors backend past-time and one-year boundaries', () => {
  const now = new Date('2026-11-12T12:00:00.000Z');
  assert.doesNotThrow(() => validateScheduleInstant(new Date(now.getTime() - 10 * 60 * 1000), now));
  assert.throws(
    () => validateScheduleInstant(new Date(now.getTime() - 10 * 60 * 1000 - 1), now),
    /не может быть в прошлом/,
  );
  assert.doesNotThrow(() => validateScheduleInstant(new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000), now));
  assert.throws(
    () => validateScheduleInstant(new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000 + 1), now),
    /более чем на год вперёд/,
  );
  assert.throws(() => validateScheduleInstant(new Date('invalid'), now), /корректные дату и время/);
});
