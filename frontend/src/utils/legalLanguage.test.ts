import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLegalLanguage } from './legalLanguage';

test('Russian UI selects Russian legal copy', () => {
  assert.equal(resolveLegalLanguage('ru'), 'ru');
});

test('all non-Russian supported UI languages use the English legal copy', () => {
  for (const language of ['en', 'es', 'pt', 'de', 'fr', 'zh']) {
    assert.equal(resolveLegalLanguage(language), 'en', language);
  }
});

test('unknown or missing UI language safely falls back to English legal copy', () => {
  assert.equal(resolveLegalLanguage(undefined), 'en');
  assert.equal(resolveLegalLanguage(null), 'en');
  assert.equal(resolveLegalLanguage(''), 'en');
});
