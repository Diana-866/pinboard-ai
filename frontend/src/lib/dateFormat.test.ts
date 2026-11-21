import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EMPTY_TIMESTAMP, formatTimestamp } from './dateFormat';

/**
 * Section 143. The admin panel formatted timestamps with the browser's own locale, so the same row read
 * `12/12/2026, 9:41:00 AM` for an American operator and `12.12.2026, 09:41` for a German one - in a panel
 * used to decide about money and account deletions. These tests pin the behaviour: same language, same
 * string; unusable input yields one visible character, never "Invalid Date".
 */

const STAMP = '2026-12-12T09:41:00.000Z';

test('a valid timestamp renders the same way for the same language, twice', () => {
  const first = formatTimestamp(STAMP, 'de');
  const second = formatTimestamp(STAMP, 'de');
  assert.equal(first, second);
  assert.match(first, /\d{2}/);
  assert.doesNotMatch(first, /Invalid Date|NaN/);
});

test('German and American formatting of the same instant differ', () => {
  const de = formatTimestamp(STAMP, 'de');
  const en = formatTimestamp(STAMP, 'en');
  // Формат строится из локали, а не из браузера: у двух языков разные разделители или порядок.
  assert.notEqual(de, en);
});

test('unusable input becomes one visible character, never "Invalid Date"', () => {
  for (const value of [null, undefined, '', 'not-a-date', 'x', Number.NaN]) {
    const rendered = formatTimestamp(value as any, 'ru');
    assert.equal(rendered, EMPTY_TIMESTAMP, `value ${String(value)} rendered ${rendered}`);
  }
});

test('a Date object and its ISO string agree', () => {
  const fromString = formatTimestamp(STAMP, 'ru');
  const fromDate = formatTimestamp(new Date(STAMP), 'ru');
  assert.equal(fromString, fromDate);
});

test('the admin panel no longer formats timestamps with the browser locale', () => {
  const files = [
    'src/components/admin/AdminBillingExceptions.tsx',
    'src/components/admin/AdminEmailOutbox.tsx',
    'src/components/admin/AdminFinancialOperations.tsx',
    'src/components/admin/AdminPaymentCreationRequests.tsx',
    'src/components/admin/AdminPinterestSchedules.tsx',
    'src/components/admin/AdminMail.tsx',
  ];
  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(path.join(process.cwd(), file), 'utf8');
    if (/\.toLocaleString\(\)|\.toLocaleDateString\(\)/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `modules still using the browser locale:\n${offenders.join('\n')}`);
});
