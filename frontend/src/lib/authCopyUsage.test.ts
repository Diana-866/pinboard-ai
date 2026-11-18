import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getAuthCopy } from '../i18n/authCopy';
import { SUPPORTED_LANGUAGES } from '../i18n/types';

/**
 * Regression guard for the copy-key class of bug.
 *
 * `Login.tsx` used to read `t.common.hide`, but `getAuthCopy()` returns a flat
 * copy object without a `common` namespace. Rendering `/login` then threw
 * `TypeError: Cannot read properties of undefined` and every sign-in was
 * blocked. No unit test noticed, because nothing ever rendered the page.
 *
 * These tests read the auth page sources and require every `t.<key>` path they
 * reference to exist in every supported language.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '..');

const AUTH_COPY_CONSUMERS = [
  'pages/Login.tsx',
  'pages/Register.tsx',
  'pages/ForgotPassword.tsx',
  'pages/ResetPassword.tsx',
  'pages/VerifyEmail.tsx',
  'pages/CheckEmail.tsx',
  'App.tsx',
];

// `t.sessionLoading`, `t.strengthLabels[...]`, `t['key']` and interpolations such
// as `${t.foo}` are all captured; optional chaining and deeper paths are not.
const COPY_REFERENCE = /\bt\.([A-Za-z_$][\w$]*)/g;

function copyReferences(source: string): string[] {
  const keys = new Set<string>();
  for (const match of source.matchAll(COPY_REFERENCE)) keys.add(match[1]);
  return [...keys].sort();
}

function hasCopyKey(copy: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(copy, key);
}

function authCopyScope(source: string): string {
  // A file may also use the full i18n dictionary (`useI18n().t`) in a different
  // component. Only the region after the auth-copy binding may be checked
  // against getAuthCopy(), so scan from that declaration onwards.
  const marker = 'const t = getAuthCopy(';
  const index = source.indexOf(marker);
  return index === -1 ? '' : source.slice(index + marker.length);
}

test('every auth copy key referenced by a page exists in every language', () => {
  const missing: string[] = [];
  for (const relative of AUTH_COPY_CONSUMERS) {
    const source = readFileSync(path.join(srcRoot, relative), 'utf8');
    const scoped = authCopyScope(source);
    assert.ok(scoped.length > 0, `${relative} must bind the auth copy to t`);
    const references = copyReferences(scoped);
    assert.ok(references.length > 0, `${relative} must reference auth copy`);
    for (const { code } of SUPPORTED_LANGUAGES) {
      const copy = getAuthCopy(code) as unknown as Record<string, unknown>;
      for (const key of references) {
        if (!hasCopyKey(copy, key)) missing.push(`${relative} -> ${code}:${key}`);
      }
    }
  }
  assert.deepEqual(missing, [], 'auth pages reference copy keys that do not exist');
});

test('auth copy stays structurally identical across all supported languages', () => {
  const reference = Object.keys(getAuthCopy('en')).sort();
  for (const { code } of SUPPORTED_LANGUAGES) {
    assert.deepEqual(
      Object.keys(getAuthCopy(code)).sort(),
      reference,
      `language ${code} must expose the same copy keys as en`
    );
  }
});

test('auth copy values are all usable strings with matching placeholders', () => {
  const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const reference = getAuthCopy('en') as unknown as Record<string, unknown>;

  for (const { code } of SUPPORTED_LANGUAGES) {
    const copy = getAuthCopy(code) as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(copy)) {
      if (Array.isArray(value)) {
        assert.ok(value.length > 0, `${code}:${key} must not be an empty list`);
        for (const entry of value) {
          assert.equal(typeof entry, 'string', `${code}:${key} entries must be strings`);
          assert.ok(entry.trim().length > 0, `${code}:${key} entries must not be blank`);
        }
        continue;
      }
      assert.equal(typeof value, 'string', `${code}:${key} must be a string`);
      const text = value as string;
      assert.ok(text.trim().length > 0, `${code}:${key} must not be blank`);
      assert.deepEqual(
        placeholders(text),
        placeholders(reference[key] as string),
        `${code}:${key} must keep the same placeholders as en`
      );
    }
  }
});

test('unknown languages fall back to English instead of returning undefined', () => {
  const fallback = getAuthCopy('xx' as never);
  assert.equal(fallback, getAuthCopy('en'));
});
