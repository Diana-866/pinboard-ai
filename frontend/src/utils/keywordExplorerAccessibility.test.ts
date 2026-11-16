import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/keywords/KeywordExplorer.tsx', import.meta.url), 'utf8');

test('keyword search errors are announced as alerts', () => {
  assert.match(source, /\{error && \([\s\S]*?<div role="alert"/);
  assert.match(source, /<span>\{error\}<\/span>/);
});

test('keyword search failures do not leave stale results visible', () => {
  assert.match(source, /catch \(err\) \{[\s\S]*?setItems\(\[\]\);[\s\S]*?setHasLoaded\(true\);[\s\S]*?setError\(/);
});

test('keyword search input remains programmatically labelled', () => {
  assert.match(source, /aria-label=\{copy\.aiPlaceholder\}/);
});
