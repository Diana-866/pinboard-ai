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
  assert.equal(resolvePinterestDestination(accounts, boardsA, 'account-b', 'board-a'), null);
  assert.equal(resolvePinterestDestination(accounts, boardsB, 'account-a', 'board-b'), null);
  assert.equal(resolvePinterestDestination(accounts, [], 'account-a', 'board-a'), null);
  assert.equal(resolvePinterestDestination(accounts, boardsA, '', 'board-a'), null);
  assert.equal(resolvePinterestDestination(accounts, boardsA, 'account-a', ''), null);
  assert.equal(resolvePinterestDestination(accounts, [{ id: 'board-a', name: ' ' }], 'account-a', 'board-a'), null);
});
