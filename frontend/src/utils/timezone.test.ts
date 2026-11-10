import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarDaysInTimezone,
  formatInstantInTimezone,
  getDefaultTimezone,
  isValidIanaTimezone,
  localDateTimeToDate,
  saveUserTimezone,
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
