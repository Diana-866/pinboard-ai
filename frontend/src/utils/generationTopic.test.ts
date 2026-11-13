import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTopicRequiredMessage, normalizeGenerationTopic } from './generationTopic';

describe('generation topic validation', () => {
  it('trims valid topics and rejects empty input', () => {
    assert.equal(normalizeGenerationTopic('  ceramic home decor  '), 'ceramic home decor');
    assert.equal(normalizeGenerationTopic(''), null);
    assert.equal(normalizeGenerationTopic('   \n\t  '), null);
  });

  it('rejects non-string values', () => {
    assert.equal(normalizeGenerationTopic(null), null);
    assert.equal(normalizeGenerationTopic(undefined), null);
  });

  it('provides validation copy for all seven interface languages', () => {
    for (const language of ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh']) {
      assert.ok(getTopicRequiredMessage(language).length > 0);
    }
    assert.equal(getTopicRequiredMessage('unknown'), getTopicRequiredMessage('en'));
  });
});
