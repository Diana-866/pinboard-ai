import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../i18n/types.ts', import.meta.url), 'utf8');
const component = readFileSync(new URL('../components/common/LockedSection.tsx', import.meta.url), 'utf8');
const languages = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'] as const;

test('plan-locked section copy is typed and translated in every supported locale', () => {
  assert.match(schema, /lockedSection:\s*\{[\s\S]*?title:\s*string;[\s\S]*?description:\s*string;[\s\S]*?viewPlans:\s*string;/);

  for (const language of languages) {
    const locale = readFileSync(new URL(`../i18n/locales/${language}.ts`, import.meta.url), 'utf8');
    const block = locale.match(/lockedSection:\s*\{([\s\S]*?)\n\s*\},/);
    assert.ok(block, `lockedSection locale block: ${language}`);
    for (const key of ['title', 'description', 'viewPlans']) {
      assert.match(block[1], new RegExp(`\\b${key}:\\s*['"][^'"]+['"]`), `${key}: ${language}`);
    }
  }
});

test('locked section renders typed copy and exposes a labelled live region', () => {
  assert.match(component, /t\.lockedSection\.title/);
  assert.match(component, /t\.lockedSection\.description/);
  assert.match(component, /t\.lockedSection\.viewPlans/);
  assert.match(component, /aria-labelledby="locked-section-title"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /<h3 id="locked-section-title"/);
  assert.doesNotMatch(component, /Раздел пока под замком|Сейчас открыт только раздел|Перейти к тарифам/);
});
