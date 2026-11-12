import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePinterestDestination } from './pinterestDestination';

const accounts = [{ id: 'account-a' }, { id: 'account-b' }];
const boardsA = [{ id: 'board-a', name: 'Board A' }];
const boardsB = [{ id: 'board-b', name: 'Board B' }];

test('resolves a board only from the selected account context', () => {
  assert.deepEqual(
    resolvePinterestDestination(accounts, boardsA, 'account-a', 'board-a'),
    { accountId: 'account-a', boardId: 'board-a', boardName: 'Board A' },
  );
});

test('rejects stale or incomplete Pinterest destination selections', () => {
  // A board list loaded for another account must not authorize the destination.
  assert.equal(resolvePinterestDestination(accounts, boardsA, 'account-b', 'board-a', 'account-a'), null);
  assert.equal(resolvePinterestDestination(accounts, boardsB, 'account-a', 'board-b', 'account-b'), null);
  assert.equal(resolvePinterestDestination(accounts, [], 'account-a', 'board-a'), null);
  assert.equal(resolvePinterestDestination(accounts, boardsA, '', 'board-a'), null);
  assert.equal(resolvePinterestDestination(accounts, boardsA, 'account-a', ''), null);
  assert.equal(resolvePinterestDestination(accounts, [{ id: 'board-a', name: ' ' }], 'account-a', 'board-a'), null);
});

test('returns no destination for malformed runtime payloads', () => {
  assert.equal(
    resolvePinterestDestination(null as any, boardsA, 'account-a', 'board-a'),
    null,
  );
  assert.equal(
    resolvePinterestDestination(accounts, undefined as any, 'account-a', 'board-a'),
    null,
  );
  assert.equal(
    resolvePinterestDestination(accounts, boardsA, null as any, 'board-a'),
    null,
  );
  assert.equal(
    resolvePinterestDestination(accounts, boardsA, 'account-a', 42 as any),
    null,
  );
});

test('fails closed when account or board IDs are duplicated or malformed', () => {
  assert.equal(
    resolvePinterestDestination([...accounts, { id: 'account-a' }], boardsA, 'account-a', 'board-a'),
    null,
  );
  assert.equal(
    resolvePinterestDestination(accounts, [...boardsA, { id: 'board-a', name: 'Duplicate' }], 'account-a', 'board-a'),
    null,
  );
  assert.equal(
    resolvePinterestDestination([{ id: ' account-a ' }], boardsA, 'account-a', 'board-a'),
    null,
  );
  assert.equal(
    resolvePinterestDestination(accounts, [{ id: ' board-a', name: 'Padded' }], 'account-a', 'board-a'),
    null,
  );
});
