import test from 'node:test';
import assert from 'node:assert/strict';
import { sweepUserScopedStorage, isUserScopedStorageKey } from './userScopedStorage';

/** Minimal in-memory implementation of the browser Storage contract. */
function makeStorage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() { return map.size; },
    key(index: number) { return Array.from(map.keys())[index] ?? null; },
    removeItem(key: string) { map.delete(key); },
    getItem(key: string) { return map.get(key) ?? null; },
  };
}

test('removes every user-scoped entry and keeps device preferences', () => {
  const storage = makeStorage({
    token: 'jwt',
    pinposy_lang: 'ru',
    pinposy_theme: 'dark',
    pinposy_user_timezone: 'Europe/Moscow',
    pinposy_ai_content_lang: 'en',
    pinposy_accounts: '[{"id":"acc-1"}]',
    pinposy_pending_pins: '[{"title":"private"}]',
    pinposy_notifications: '[]',
    pinposy_account_cadence: '{"acc-1":8}',
    pinposy_use_letter_avatar: 'true',
    pinposy_avatar: 'https://cdn.example/avatar.png',
    'pinposy_generation_request_v2:abc': '{"fingerprint":"fp1:aaaaaaaaaaaaaaaa"}',
    'pinposy.pendingVerificationEmail': 'user@example.test',
    'pinposy_pin_description:board-1:pin-1': '{"title":"draft"}',
  });

  const removed = sweepUserScopedStorage(storage);

  for (const key of ['pinposy_lang', 'pinposy_theme', 'pinposy_user_timezone', 'pinposy_ai_content_lang']) {
    assert.ok(storage.map.has(key), `${key} must survive`);
  }
  for (const key of [
    'pinposy_accounts',
    'pinposy_pending_pins',
    'pinposy_notifications',
    'pinposy_account_cadence',
    'pinposy_use_letter_avatar',
    'pinposy_avatar',
    'pinposy_generation_request_v2:abc',
    'pinposy.pendingVerificationEmail',
    'pinposy_pin_description:board-1:pin-1',
  ]) {
    assert.equal(storage.map.has(key), false, `${key} must be removed`);
  }
  assert.equal(removed.length, 9);
});

test('never removes keys that do not belong to the app', () => {
  const storage = makeStorage({ token: 'jwt', other_app_cache: 'x', pinposy_lang: 'en' });
  const removed = sweepUserScopedStorage(storage);
  assert.deepEqual(removed, []);
  assert.ok(storage.map.has('other_app_cache'));
  assert.ok(storage.map.has('token'), 'the auth token is cleared by clearAuthToken, not by this sweep');
});

test('classifies keys', () => {
  assert.equal(isUserScopedStorageKey('pinposy_accounts'), true);
  assert.equal(isUserScopedStorageKey('pinposy.pendingVerificationEmail'), true);
  assert.equal(isUserScopedStorageKey('pinposy_lang'), false);
  assert.equal(isUserScopedStorageKey('pinposy_theme'), false);
  assert.equal(isUserScopedStorageKey(''), false);
  assert.equal(isUserScopedStorageKey(null), false);
  assert.equal(isUserScopedStorageKey(42), false);
});

test('removing many keys does not skip entries when indices shift', () => {
  const entries: Record<string, string> = {};
  for (let index = 0; index < 12; index += 1) entries[`pinposy_item_${index}`] = 'v';
  const storage = makeStorage(entries);
  sweepUserScopedStorage(storage);
  assert.equal(storage.map.size, 0);
});

test('a storage that throws is handled without propagating', () => {
  const broken = {
    get length(): number { throw new Error('denied'); },
    key(): string | null { throw new Error('denied'); },
    removeItem(): void { throw new Error('denied'); },
  };
  assert.deepEqual(sweepUserScopedStorage(broken), []);
});
