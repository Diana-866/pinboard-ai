import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reading the auth token straight out of localStorage throws in privacy modes and in
 * sandboxed contexts, because even the property access can fail. That broke the route
 * guard once (FE-01 in the frontend audit), and three more direct reads survived:
 * the image upload in the approval desk (which turned a storage error into "image could
 * not be replaced" and could send "Bearer null"), the generation recovery lookup and
 * the language sync. They now go through lib/authStorage.
 *
 * This test keeps the access path single. The token may only be read through the
 * helper, so a new component cannot quietly reintroduce an unguarded read.
 */

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));
const HELPER = 'lib/authStorage.ts';
const EXTENSIONS = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build']);
// Tests may exercise blocked storage on purpose.
const isTestFile = (path: string) => /\.test\.(ts|tsx)$/.test(path) || path.includes('.spec.');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) sourceFiles(full, out);
      continue;
    }
    if (EXTENSIONS.test(entry)) out.push(full);
  }
  return out;
}

const files = sourceFiles(SRC_ROOT)
  .map((path) => ({ path, relativePath: relative(SRC_ROOT, path).replace(/\\/g, '/') }))
  .filter((entry) => entry.relativePath !== HELPER && !isTestFile(entry.relativePath));

test('the source tree was actually scanned', () => {
  assert.ok(files.length > 50, `expected to scan the frontend sources, saw ${files.length}`);
});

test('the auth token is never read outside lib/authStorage', () => {
  const directReads = /localStorage\s*\.\s*getItem\s*\(\s*['"`]token['"`]\s*\)/;
  const offenders = files
    .filter((entry) => directReads.test(readFileSync(entry.path, 'utf8')))
    .map((entry) => entry.relativePath);
  assert.deepEqual(
    offenders,
    [],
    `read the token through readAuthToken()/hasStoredAuthToken() instead:\n${offenders.join('\n')}`
  );
});

test('the helper itself stays defensive', () => {
  const helper = readFileSync(join(SRC_ROOT, HELPER), 'utf8');
  // Accessing window.localStorage must be guarded: that access is what throws.
  assert.match(helper, /try\s*\{\s*return window\.localStorage;/);
  assert.match(helper, /export function readAuthToken/);
  assert.match(helper, /export function hasStoredAuthToken/);
  // A blank token must not be treated as a session.
  assert.match(helper, /typeof token === "string" && token\.trim\(\)/);
});

test('the token is never written outside lib/authStorage', () => {
  const directWrites = /localStorage\s*\.\s*setItem\s*\(\s*['"`]token['"`]/;
  const offenders = files
    .filter((entry) => directWrites.test(readFileSync(entry.path, 'utf8')))
    .map((entry) => entry.relativePath);
  assert.deepEqual(offenders, [], `write the token through writeAuthToken():\n${offenders.join('\n')}`);
});
