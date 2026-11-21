import test from 'node:test';
import assert from 'node:assert/strict';
import { getApiFallbackMessage } from './apiErrorMessages';

test('API fallback messages are available in every supported interface locale', () => {
  for (const locale of ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh']) {
    for (const key of ['network', 'invalidResponse', 'generic'] as const) {
      const message = getApiFallbackMessage(key, locale);
      assert.ok(message.length > 0, `${locale}/${key} should have a message`);
    }
  }
});

test('API fallback messages default safely to English for unsupported locales', () => {
  assert.equal(
    getApiFallbackMessage('generic', 'ja-JP'),
    'Something went wrong. Please try again.'
  );
  assert.equal(
    getApiFallbackMessage('network', null),
    'The server is not responding. Check your connection and try again in a minute.'
  );
});

test('locale tags are normalized to their base language', () => {
  assert.equal(
    getApiFallbackMessage('generic', 'ru-RU'),
    'Произошла ошибка. Попробуйте ещё раз.'
  );
});
