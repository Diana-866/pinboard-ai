import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { normalizeApiBase } from './api';

/**
 * Адрес API склеивается с путями, которые начинаются со слэша: `${API_URL}${path}`.
 * Значение с завершающим слэшем давало `/api//login`; Caddy снимает `/api`, backend получает
 * `//login` и отвечает 404 — то есть сайт открывается, а вход не работает. Владельцу достаточно
 * скопировать адрес из браузера вместе со слэшем, чтобы получить эту поломку.
 */

const FALLBACK = 'https://pinboard-ai-backend.onrender.com';

test('a trailing slash is removed so request paths do not double the separator', () => {
  assert.equal(normalizeApiBase('/api/', FALLBACK), '/api');
  assert.equal(normalizeApiBase('/api//', FALLBACK), '/api');
  assert.equal(normalizeApiBase('https://pinposy.com/api/', FALLBACK), 'https://pinposy.com/api');
});

test('surrounding whitespace is removed', () => {
  assert.equal(normalizeApiBase('  /api  ', FALLBACK), '/api');
});

test('a value that is only slashes or empty falls back instead of pointing at the site root', () => {
  assert.equal(normalizeApiBase('', FALLBACK), FALLBACK);
  assert.equal(normalizeApiBase('   ', FALLBACK), FALLBACK);
  assert.equal(normalizeApiBase('/', FALLBACK), FALLBACK);
  assert.equal(normalizeApiBase('///', FALLBACK), FALLBACK);
  assert.equal(normalizeApiBase(undefined, FALLBACK), FALLBACK);
  assert.equal(normalizeApiBase(null, FALLBACK), FALLBACK);
  assert.equal(normalizeApiBase(42, FALLBACK), FALLBACK);
});

test('a value without a trailing slash is left exactly as written', () => {
  assert.equal(normalizeApiBase('/api', FALLBACK), '/api');
  assert.equal(normalizeApiBase('https://api.example.com/v1', FALLBACK), 'https://api.example.com/v1');
});

test('the module applies the normaliser to the configured address', () => {
  const source = readFileSync(fileURLToPath(new URL('./api.ts', import.meta.url)), 'utf8');
  // Нормализация применяется к самому значению из окружения, а не к чему-то рядом.
  assert.match(source, /normalizeApiBase\(configuredApiUrl, configuredApiUrl\)/);
  // Адрес прошлого хостинга допустим только как ветка «переменная не задана»: иначе он
  // попадает в собранный бандл и подменяет собой выключенный сервис.
  assert.match(source, /: "https:\/\/pinboard-ai-backend\.onrender\.com";/);
  assert.doesNotMatch(source, /API_URL = "https:\/\/pinboard-ai-backend\.onrender\.com"/);
  assert.doesNotMatch(source, /API_URL = configuredApiUrl \|\|/);
});
