import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPendingGenerationContext,
  readPendingGenerationContext,
  writePendingGenerationContext,
  type PendingGenerationContext,
} from './pendingGenerationContext';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const context: PendingGenerationContext = {
  ownerId: 'user-1',
  boardId: 'board-1',
  topic: 'A private campaign topic',
  tone: 'inspirational',
  contentLanguage: 'en',
  count: 5,
  aspectMode: 'randomizer',
  selectedSingleRatio: '2:3',
  randomizerRatios: { '2:3': true, '9:16': true, '3:4': true, '4:5': false, '1:1': false },
};

test('restores exact generation settings for the same owner after component memory is lost', () => {
  const storage = memoryStorage();
  const fingerprint = 'fp1:0123456789abcdef';
  assert.equal(writePendingGenerationContext(fingerprint, context, storage), true);
  assert.deepEqual(readPendingGenerationContext(fingerprint, 'user-1', storage), context);
});

test('does not expose another account generation settings', () => {
  const storage = memoryStorage();
  const fingerprint = 'fp1:0123456789abcdef';
  writePendingGenerationContext(fingerprint, context, storage);
  assert.equal(readPendingGenerationContext(fingerprint, 'user-2', storage), null);
});

test('rejects malformed context and malformed fingerprints', () => {
  const storage = memoryStorage();
  const fingerprint = 'fp1:0123456789abcdef';
  assert.equal(writePendingGenerationContext('bad', context, storage), false);
  assert.equal(writePendingGenerationContext(fingerprint, { ...context, count: 99 }, storage), false);
  assert.equal(readPendingGenerationContext('bad', 'user-1', storage), null);
});

test('clears one request context without touching other recovery data', () => {
  const storage = memoryStorage();
  const first = 'fp1:0123456789abcdef';
  const second = 'fp1:fedcba9876543210';
  writePendingGenerationContext(first, context, storage);
  writePendingGenerationContext(second, { ...context, topic: 'Another topic' }, storage);
  clearPendingGenerationContext(first, storage);
  assert.equal(readPendingGenerationContext(first, 'user-1', storage), null);
  assert.equal(readPendingGenerationContext(second, 'user-1', storage)?.topic, 'Another topic');
});
