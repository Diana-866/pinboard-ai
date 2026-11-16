import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const login = readFileSync(new URL('../pages/Login.tsx', import.meta.url), 'utf8');
const register = readFileSync(new URL('../pages/Register.tsx', import.meta.url), 'utf8');

for (const [page, source] of [['login', login], ['registration', register]] as const) {
  test('%PAGE% password visibility toggle is keyboard accessible and exposes its state'.replace('%PAGE%', page), () => {
    const toggle = source.match(/<button\b(?:(?!<\/button>)[\s\S])*?onClick={\(\) => setShowPassword\(\(v\) => !v\)}(?:(?!<\/button>)[\s\S])*?<\/button>/);
    assert.ok(toggle, 'password visibility toggle exists');
    assert.match(toggle[0], /aria-label={showPassword \? t\.hide : t\.show}/);
    assert.match(toggle[0], /aria-controls="password"/);
    assert.match(toggle[0], /aria-pressed={showPassword}/);
    assert.doesNotMatch(toggle[0], /tabIndex={-1}/);
  });
}
