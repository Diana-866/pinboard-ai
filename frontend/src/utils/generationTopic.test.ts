import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getExplicitGenerationTopic } from './generationTopic';

test('trims an explicitly supplied generation topic', () => {
  assert.equal(getExplicitGenerationTopic('  handmade ceramic vase  '), 'handmade ceramic vase');
});

test('rejects empty and whitespace-only generation topics', () => {
  assert.equal(getExplicitGenerationTopic(''), null);
  assert.equal(getExplicitGenerationTopic('  \n\t '), null);
});

test('rejects non-string generation topics', () => {
  assert.equal(getExplicitGenerationTopic(null), null);
  assert.equal(getExplicitGenerationTopic(undefined), null);
  assert.equal(getExplicitGenerationTopic(42), null);
});
