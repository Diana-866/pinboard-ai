import test from 'node:test';
import assert from 'node:assert/strict';
import { getDemoNavigationTarget } from './demoNavigation';

test('routes common section requests across supported interface languages', () => {
  const cases: Array<[string, string, string]> = [
    ['ru', 'Покажи мои доски', 'boards'],
    ['en', 'Open the calendar', 'calendar'],
    ['de', 'Wo finde ich meine Pinnwand?', 'boards'],
    ['es', 'Quiero programar publicaciones', 'calendar'],
    ['fr', 'Où trouver les mots-clés ?', 'keywords'],
    ['pt', 'Quero criar um novo pin', 'generator'],
    ['zh', '在哪里查看数据指标？', 'analytics'],
    ['ru', 'Открыть тарифы и оплату', 'pricing'],
    ['en', 'Open settings', 'settings'],
    ['en', 'Show competitors', 'competitors'],
  ];

  for (const [language, query, expected] of cases) {
    assert.equal(getDemoNavigationTarget(query, language), expected, `${language}: ${query}`);
  }
});

test('returns no destination for empty or unrelated messages', () => {
  assert.equal(getDemoNavigationTarget('   ', 'ru'), undefined);
  assert.equal(getDemoNavigationTarget('Hello, how are you?', 'en'), undefined);
});
