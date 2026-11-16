import test from 'node:test';
import assert from 'node:assert/strict';
import { getProtectedRouteState } from './protectedRouteState';

test('redirects immediately when no token is stored', () => {
  assert.equal(getProtectedRouteState(false, false, false), 'redirect');
});

test('waits for initial profile hydration before rendering protected screens', () => {
  assert.equal(getProtectedRouteState(true, false, false), 'loading');
});

test('redirects after hydration when the token did not produce a user profile', () => {
  assert.equal(getProtectedRouteState(true, true, false), 'redirect');
});

test('renders protected screens only after token and profile are both available', () => {
  assert.equal(getProtectedRouteState(true, true, true), 'authenticated');
});
