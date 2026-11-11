import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const localeDir = join(root, '..', 'i18n', 'locales');
const translationSchemaPath = join(root, '..', 'i18n', 'types.ts');

// Account deletion has an automated worker pipeline, but rollout is explicitly
// gated and no completion SLA is promised to users.
const locales = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];
const forbiddenPromises = [
  /within\s+30\s+days/i,
  /in\s+30\s+days/i,
  /30\s+d[ií]as/i,
  /30\s+jours/i,
  /30\s+Tagen/i,
  /30\s*天/,
];

test('account deletion confirmation does not promise an unsupported erasure deadline', () => {
  const schema = readFileSync(translationSchemaPath, 'utf8');
  assert.match(schema, /deleteAccountUnavailable:\s*string;/, 'TranslationSchema must declare the unavailable message');
  for (const locale of locales) {
    const source = readFileSync(join(localeDir, `${locale}.ts`), 'utf8');
    const lines = source.split(/\r?\n/);
    const line = lines.find((entry) => /deleteAccountDone:/.test(entry));
    assert.ok(line, `missing deleteAccountDone translation for ${locale}`);
    assert.ok(lines.some((entry) => /deleteAccountUnavailable:/.test(entry)), `missing deleteAccountUnavailable translation for ${locale}`);
    for (const pattern of forbiddenPromises) {
      assert.doesNotMatch(line, pattern, `${locale} contains an unsupported deletion deadline`);
    }
  }
});
