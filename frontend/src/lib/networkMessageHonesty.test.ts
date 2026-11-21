import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Section 157. The "server unreachable" message claimed the server "may be waking up after
 * inactivity" — true of the old hosted backend, false everywhere else. The owner read exactly this
 * text three times while the real cause was a stale `VITE_API_URL`, and it pointed her away from it.
 *
 * A message must state what the customer can observe ("not responding") and what to do next,
 * not guess about infrastructure it cannot see.
 */

const root = process.cwd();
const source = readFileSync(path.join(root, 'src', 'lib', 'apiErrorMessages.ts'), 'utf8');
const apiSource = readFileSync(path.join(root, 'src', 'lib', 'api.ts'), 'utf8');

const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];

function networkMessage(language: string): string {
  const start = source.indexOf(`  ${language}: {`);
  assert.notEqual(start, -1, `locale block ${language} not found`);
  const block = source.slice(start, source.indexOf('\n  },', start));
  const startIdx = block.indexOf("network: " + String.fromCharCode(39)) + "network: ".length + 1;
  const match = [block.slice(startIdx, block.indexOf(String.fromCharCode(39), startIdx))];
  assert.ok(match, `network message missing for ${language}`);
  return match[0];
}

test('every language has a network message', () => {
  for (const language of LANGUAGES) {
    assert.ok(networkMessage(language).length > 20, `${language} message is too short`);
  }
});

test('no language guesses about infrastructure it cannot see', () => {
  const forbidden = [/waking up/i, /просыпа/i, /iniciando/i, /a iniciar/i, /startet nach/i, /réveill/i, /启动/i];
  const offenders: string[] = [];
  for (const language of LANGUAGES) {
    const message = networkMessage(language);
    for (const pattern of forbidden) {
      if (pattern.test(message)) offenders.push(`${language}: ${message}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('every language tells the customer what to do next', () => {
  const hints: Record<string, RegExp> = {
    en: /try again/i,
    ru: /попробуйте/i,
    es: /inténtalo/i,
    pt: /tente/i,
    de: /versuche/i,
    fr: /réessayez/i,
    zh: /再试/,
  };
  for (const language of LANGUAGES) {
    assert.match(networkMessage(language), hints[language], `${language} has no next step`);
  }
});

test('a missing VITE_API_URL is reported in development', () => {
  assert.match(apiSource, /VITE_API_URL is not set/);
  assert.match(apiSource, /env\?\.DEV/);
});
