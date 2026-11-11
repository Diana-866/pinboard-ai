import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const localeDir = join(root, '..', 'i18n', 'locales');

// Account deletion is currently a request/fencing flow. Physical erasure is
// not automated yet, so translations must never promise a completion deadline.
const locales = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];
const forbiddenPromises = [
  /within\s+30\s+days/i,
  /in\s+30\s+days/i,
  /30\s+d[ií]as/i,
  /30\s+jours/i,
  /30\s+Tagen/i,
  /30\s*天/,
];

test('account deletion confirmation does not promise an unimplemented erasure deadline', () => {
  for (const locale of locales) {
    const source = readFileSync(join(localeDir, `${locale}.ts`), 'utf8');
    const line = source.split(/\r?\n/).find((entry) => /deleteAccountDone:/.test(entry));
    assert.ok(line, `missing deleteAccountDone translation for ${locale}`);
    for (const pattern of forbiddenPromises) {
      assert.doesNotMatch(line, pattern, `${locale} contains an unsupported deletion deadline`);
    }
  }
});
