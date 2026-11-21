import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Section 153. `components/auth/AuthModal.tsx` was 326 lines of an alternative login window that
 * <strong>nothing mounted</strong>; it carried `// @ts-nocheck` (so TypeScript never checked it),
 * 23 Russian strings, its own error texts and its own Google/Apple buttons.
 *
 * A dead copy of the most security-sensitive screen in the product is not harmless: it is the file
 * someone will "quickly fix" next time the login screen breaks. It is deleted, and the two habits that
 * let it live are now forbidden:
 *   1. `@ts-nocheck` in a source file (it hides real type errors from `tsc --noEmit`);
 *   2. an `auth` component that no other file imports.
 */

const root = process.cwd();
const sourceFiles = (): string[] =>
  execSync('git ls-files src', { encoding: 'utf8', cwd: root })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\.(ts|tsx)$/.test(line))
    .filter((line) => !line.endsWith('.test.ts'));

test('the scan sees the source tree (floor, not an empty list)', () => {
  const files = sourceFiles();
  assert.ok(files.length > 60, `expected the whole src tree, got ${files.length} files`);
  assert.ok(files.includes('src/App.tsx'));
});

test('no source file switches TypeScript off', () => {
  const offenders: string[] = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(path.join(root, file), 'utf8');
    if (/@ts-nocheck/.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `@ts-nocheck is back in:\n${offenders.join('\n')}`);
});

test('the auth context exposes no modal state that nothing renders', () => {
  // Первая версия проверок пропустила возврат мёртвого `closeAuthModal`: удалить состояние окна
  // и не запретить его возвращение — половина работы.
  const context = readFileSync(path.join(root, 'src', 'context', 'AuthContext.tsx'), 'utf8');
  assert.equal(context.includes('isAuthModalOpen'), false, 'dead modal state is back');
  assert.equal(context.includes('closeAuthModal'), false, 'dead closeAuthModal is back');
});

test('the unused alternative login window stays deleted', () => {
  assert.equal(existsSync(path.join(root, 'src', 'components', 'auth', 'AuthModal.tsx')), false);
});

test('every component in the tree is imported somewhere', () => {
  // Раздел 163. Раньше проверка смотрела только `components/auth`, и поэтому не видела
  // `PublishPinButton` (единственный путь публикации, не смонтированный нигде) и `SwipeReviewModal`
  // (364 строки с выдуманными русскими пинами в начальном состоянии). Теперь проверяется весь `components`.
  const files = sourceFiles();
  const componentFiles: string[] = [];
  const collect = (dir: string) => {
    for (const name of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${name.name}`;
      if (name.isDirectory()) collect(rel);
      else if (/\.tsx?$/.test(name.name) && !/\.test\.tsx?$/.test(name.name)) componentFiles.push(rel);
    }
  };
  collect('src/components');
  assert.ok(componentFiles.length > 20, `expected the whole component tree, got ${componentFiles.length}`);
  const sources = new Map(files.map((file) => [file, readFileSync(path.join(root, file), 'utf8')]));
  const orphans: string[] = [];
  for (const file of componentFiles) {
    const base = path.basename(file).replace(/\.tsx?$/, '');
    const imported = [...sources].some(
      ([other, text]) => other !== file && new RegExp(`from ['"][^'"]*${base}['"]`).test(text)
    );
    if (!imported) orphans.push(file);
  }
  assert.deepEqual(orphans, [], `these components are mounted nowhere:\n${orphans.join('\n')}`);

  // Публикация должна оставаться доступной из живого экрана (раздел 162).
  assert.equal((orphans as string[]).includes("src/components/pins/PublishPinButton.tsx"), false);
});
