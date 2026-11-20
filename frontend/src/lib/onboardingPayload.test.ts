import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOnboardingPayload, ONBOARDING_CONTENT_LANGUAGES } from './onboardingPayload';

test('the wizard sends the language the customer is reading', () => {
  assert.equal(buildOnboardingPayload('de', 'https://example.de', 'Blumen').language, 'de');
  assert.equal(buildOnboardingPayload('ja', null, '').language, 'ja');
});

test('the language is normalized before it is sent', () => {
  assert.equal(buildOnboardingPayload('  PT  ', null, '').language, 'pt');
});

test('an unsupported or missing UI language falls back to the product default', () => {
  for (const language of [undefined, null, '', 'klingon', 'it-it']) {
    assert.equal(buildOnboardingPayload(language, null, '').language, 'ru', `language ${String(language)}`);
  }
});

test('every language the backend can generate is accepted by the payload builder', () => {
  for (const language of ONBOARDING_CONTENT_LANGUAGES) {
    assert.equal(buildOnboardingPayload(language, null, '').language, language);
  }
  // The list must match the backend's PIN_CONTENT_LANGUAGES; a mismatch would make onboarding fail with 422.
  assert.deepEqual([...ONBOARDING_CONTENT_LANGUAGES].sort(), ['de', 'en', 'es', 'fr', 'it', 'ja', 'pt', 'ru', 'zh']);
});

test('an empty website becomes null and comments are trimmed', () => {
  assert.deepEqual(buildOnboardingPayload('en', '   ', '  hello  '), {
    websiteUrl: null,
    productComment: 'hello',
    language: 'en',
  });
  assert.deepEqual(buildOnboardingPayload('en', ' https://example.com ', ''), {
    websiteUrl: 'https://example.com',
    productComment: '',
    language: 'en',
  });
});
