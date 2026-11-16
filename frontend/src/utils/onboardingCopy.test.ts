import test from 'node:test';
import assert from 'node:assert/strict';
import { getOnboardingCopy } from '../i18n/onboardingCopy';
import type { SupportedLanguage } from '../i18n/types';

const languages: SupportedLanguage[] = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];

test('onboarding fallback messages are present for every supported interface language', () => {
  for (const language of languages) {
    const copy = getOnboardingCopy(language);
    assert.ok(copy.profileRefreshError.trim(), `profileRefreshError: ${language}`);
    assert.ok(copy.priceUnavailable.trim(), `priceUnavailable: ${language}`);
    assert.ok(copy.priceLoading.trim(), `priceLoading: ${language}`);
  }
});

test('non-English onboarding locales do not silently reuse English fallback copy', () => {
  for (const language of languages.filter((value) => value !== 'en')) {
    const copy = getOnboardingCopy(language);
    assert.notEqual(copy.priceUnavailable, 'Price unavailable', language);
    assert.notEqual(copy.priceLoading, 'Loading…', language);
  }
});
