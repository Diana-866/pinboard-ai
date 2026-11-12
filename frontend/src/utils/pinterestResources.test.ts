import test from 'node:test';
import assert from 'node:assert/strict';
import { requirePinterestAccounts, requirePinterestBoards } from './pinterestResources';

test('accepts empty and valid Pinterest account lists', () => {
  assert.deepEqual(requirePinterestAccounts([]), []);
  assert.deepEqual(requirePinterestAccounts([{ id: 'account-1', username: 'creator' }]), [
    { id: 'account-1', username: 'creator' },
  ]);
});

test('rejects malformed, padded, and duplicate Pinterest account IDs', () => {
  assert.throws(() => requirePinterestAccounts(null), /список аккаунтов/);
  assert.throws(() => requirePinterestAccounts([{ id: ' ' }]), /идентификатор аккаунта/);
  assert.throws(() => requirePinterestAccounts([{ id: ' account-1 ' }]), /идентификатор аккаунта/);
  assert.throws(() => requirePinterestAccounts([{ id: 'account-1' }, { id: 'account-1' }]), /повторяющийся идентификатор аккаунта/);
});

test('accepts empty and valid Pinterest board lists', () => {
  assert.deepEqual(requirePinterestBoards([]), []);
  assert.deepEqual(requirePinterestBoards([{ id: 'board-1', name: '  Recipes  ' }]), [
    { id: 'board-1', name: 'Recipes' },
  ]);
});

test('rejects malformed, padded, duplicate, or unnamed Pinterest boards', () => {
  assert.throws(() => requirePinterestBoards({ boards: [] }), /список досок/);
  assert.throws(() => requirePinterestBoards([{ id: ' board-1', name: 'Recipes' }]), /идентификатор доски/);
  assert.throws(() => requirePinterestBoards([{ id: 'board-1', name: 'Recipes' }, { id: 'board-1', name: 'Other' }]), /повторяющийся идентификатор доски/);
  assert.throws(() => requirePinterestBoards([{ id: 'board-1', name: '  ' }]), /без названия/);
});
