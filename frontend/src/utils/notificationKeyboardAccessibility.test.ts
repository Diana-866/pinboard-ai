import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/layout/Header.tsx', import.meta.url), 'utf8');

test('notification center exposes its expanded state and labelled region', () => {
  assert.match(source, /aria-expanded=\{notifDropdownOpen\}/);
  assert.match(source, /aria-controls="notification-center"/);
  assert.match(source, /id="notification-center"[\s\S]*?role="region"/);
  assert.match(source, /aria-label=\{t\.notifications\.title\}/);
});

test('notification entries are keyboard reachable and activate on Enter and Space', () => {
  assert.match(source, /role="button"[\s\S]*?tabIndex=\{0\}/);
  assert.match(source, /onKeyDown=\{\(event\) => \{[\s\S]*?event\.key === 'Enter'[\s\S]*?event\.key === ' '[\s\S]*?event\.preventDefault\(\)[\s\S]*?handleNotificationActivate\(item\)/);
  assert.match(source, /focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/);
});

test('pointer and keyboard activation share the same notification action', () => {
  assert.match(source, /onClick=\{\(\) => handleNotificationActivate\(item\)\}/);
  assert.match(source, /const handleNotificationActivate = \(item: \(typeof notifications\)\[number\]\) => \{[\s\S]*?markAsRead\(item\.id\)[\s\S]*?onNavigateTab\(item\.actionTab\)[\s\S]*?setNotifDropdownOpen\(false\)/);
});
