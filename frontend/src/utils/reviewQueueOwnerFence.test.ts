import assert from 'node:assert/strict';
import test from 'node:test';
import { isReviewQueueOwnerCurrent } from './reviewQueueOwnerFence';

test('accepts work owned by the current authenticated session', () => {
  const snapshot = { userId: 'user-a', generation: 4 };
  assert.equal(isReviewQueueOwnerCurrent(snapshot, snapshot), true);
});

test('rejects queued work after switching to another account', () => {
  assert.equal(
    isReviewQueueOwnerCurrent(
      { userId: 'user-a', generation: 4 },
      { userId: 'user-b', generation: 5 },
    ),
    false,
  );
});

test('rejects stale work after switching away and back to the same account', () => {
  assert.equal(
    isReviewQueueOwnerCurrent(
      { userId: 'user-a', generation: 4 },
      { userId: 'user-a', generation: 6 },
    ),
    false,
  );
});

test('rejects work after sign-out even if the old user signs in again', () => {
  assert.equal(
    isReviewQueueOwnerCurrent(
      { userId: 'user-a', generation: 4 },
      { userId: 'user-a', generation: 7 },
    ),
    false,
  );
});

test('rejects snapshots without an authenticated owner', () => {
  assert.equal(
    isReviewQueueOwnerCurrent(
      { userId: '', generation: 4 },
      { userId: '', generation: 4 },
    ),
    false,
  );
});


test('calendar mutations capture and recheck the initiating account session', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const appPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx');
  const source = await readFile(appPath, 'utf8');
  const handlers = [
    'handleSchedulePin',
    'handleReconcileLegacySchedule',
    'handleChangeFailedScheduleBoard',
    'handleRetryScheduledPin',
    'handleCancelScheduledPin',
  ];

  for (const name of handlers) {
    const start = source.indexOf(`const ${name} = async`);
    assert.notEqual(start, -1, `${name} must exist`);
    const nextHandler = source.indexOf('\n  const handle', start + 1);
    const body = source.slice(start, nextHandler === -1 ? source.length : nextHandler);
    assert.match(body, /const ownerSnapshot =/, `${name} must snapshot its initiating session`);
    assert.match(body, /assertCurrentOwner\(\);/, `${name} must reject stale sessions`);
    assert.match(
      body,
      /assertCurrentOwner\(\);[\s\S]{0,500}setScheduledPins\(/,
      `${name} must recheck ownership before mutating calendar state`,
    );
  }
});
