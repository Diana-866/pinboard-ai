import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('../components/bot/FloatingStrategistBot.tsx', import.meta.url), 'utf8');
const languages = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'] as const;

test('strategist UI discloses demo mode instead of claiming to be online', () => {
  assert.match(component, /t\.bot\.statusBadge/);
  assert.match(component, /getDemoNavigationTarget/);
  assert.match(component, /buildAccountSummary/);
  assert.doesNotMatch(component, /from ['"](?:axios|\.\.\/\.\.\/lib\/api)['"]|\bapiRequest\s*\(|\bfetch\s*\(/);

  const expected = {
    en: 'Demo',
    ru: 'Демо-режим',
    es: 'Modo demo',
    pt: 'Modo de demonstração',
    de: 'Demo-Modus',
    fr: 'Mode démo',
    zh: '演示模式',
  };

  for (const language of languages) {
    const locale = readFileSync(new URL(`../i18n/locales/${language}.ts`, import.meta.url), 'utf8');
    const match = locale.match(/statusBadge:\s*(['"])(.*?)\1/);
    assert.ok(match, `statusBadge: ${language}`);
    assert.equal(match[2], expected[language], `demo disclosure: ${language}`);
  }
});
