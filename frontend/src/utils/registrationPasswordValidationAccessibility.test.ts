import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const register = readFileSync(new URL('../pages/Register.tsx', import.meta.url), 'utf8');

test('registration password mismatch is exposed as an accessible field error', () => {
  const confirmIndex = register.indexOf('id="confirm"');
  const confirmField = register.slice(confirmIndex, register.indexOf('</div>', confirmIndex));
  assert.match(confirmField, /aria-invalid={!!confirm && confirm !== password}/);
  assert.match(confirmField, /aria-describedby={confirm && confirm !== password \? "confirm-password-error" : undefined}/);
  assert.match(confirmField, /id="confirm-password-error" role="alert"/);
  assert.match(confirmField, /{t\.passwordMismatch}/);
});
