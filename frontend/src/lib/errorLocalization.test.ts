import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * A user-facing error must never be a hardcoded Russian string in the source: the product
 * ships seven interface languages, so a literal shows the wrong language exactly when
 * something has gone wrong. Fifty such strings existed; they have been moved into the i18n
 * copies (auth, publishing, appErrors, appErrorCopy).
 *
 * The admin panels are exempt on purpose — the only reader there is the owner, who works in
 * Russian — and that exemption is asserted, so it cannot quietly grow into customer screens.
 */

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CYRILLIC = /[\u0400-\u04FF]/;
const USER_FACING = /(alert\(|setError\(|new Error\()/;
const ADMIN_PREFIX = 'components/admin/';

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      sourceFiles(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

function violations(): { file: string; line: number; text: string }[] {
  const found: { file: string; line: number; text: string }[] = [];
  for (const file of sourceFiles(SRC)) {
    const relative = path.relative(SRC, file).split(path.sep).join('/');
    if (relative.startsWith(ADMIN_PREFIX)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (USER_FACING.test(line) && /['"`][^'"`]*[\u0400-\u04FF]/.test(line)) {
        found.push({ file: relative, line: index + 1, text: line.trim() });
      }
    });
  }
  return found;
}

test('no customer-facing error message is a hardcoded Russian literal', () => {
  const found = violations();
  const report = found.map((item) => `${item.file}:${item.line}: ${item.text}`).join('\n');
  assert.deepEqual(found, [], `move these into the i18n copy instead:\n${report}`);
});

test('the admin panels are the only exempt area and they do contain such literals', () => {
  // The exemption must be a real boundary: if the admin panels stopped having them, the
  // scan is probably not seeing what it thinks it sees.
  const adminHits: string[] = [];
  for (const file of sourceFiles(path.join(SRC, 'components', 'admin'))) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line) => {
      if (USER_FACING.test(line) && /['"`][^'"`]*[\u0400-\u04FF]/.test(line)) adminHits.push(line.trim());
    });
  }
  assert.ok(adminHits.length > 0, 'the scan must still detect the deliberately Russian admin strings');
});

test('the scan itself catches a Russian literal in a customer file', () => {
  // A guard that cannot fail is worse than no guard: prove the pattern matches the shape it
  // is supposed to forbid.
  assert.equal(USER_FACING.test("setError('Не удалось загрузить доски');"), true);
  assert.equal(USER_FACING.test("throw new Error(\"Сессия изменилась\");"), true);
  assert.equal(/['"`][^'"`]*[\u0400-\u04FF]/.test("setError('Не удалось загрузить доски');"), true);
  // Localized copy must not trip it.
  assert.equal(/['"`][^'"`]*[\u0400-\u04FF]/.test("setError(t.publishing.boardsLoadFailed);"), false);
  assert.equal(/['"`][^'"`]*[\u0400-\u04FF]/.test("throw new Error(getAppErrorMessage('userNotIdentified'));"), false);
});
