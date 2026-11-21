import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Section 132. The publication button taught the lesson: user-facing Russian sentences lived inside
 * components, so a customer reading the product in German or Chinese met text they may not understand -
 * on the most consequential screens, in the messages that explain what happened to their money or their
 * pins. Section 131 fixed one component; this record makes sure the next one cannot be added silently.
 *
 * It is a ceiling, not a promise. 604 lines of Cyrillic remain in 27 files, mostly the landing page and
 * the admin panel. Every listed file may shrink and none may grow; a file that disappears from the list
 * has been fixed and must be removed here so the record stays true.
 */
const SRC = path.join(process.cwd(), 'src');

/**
 * Scope: components, pages and the app shell. `src/lib` and `src/utils` are deliberately outside the
 * ceiling because they host per-language tables (`appErrorCopy`, `scheduleRetryReason`) where Russian is a
 * translation, not a leak. Their customer-facing Russian is handled separately - see section 136 for
 * `timezone.ts` and `apiErrorMessages.ts`.
 */
const CEILING: Record<string, number> = {
  'components/admin/AdminBillingExceptions.tsx': 14,
  'components/admin/AdminEmailOutbox.tsx': 33,
  'components/admin/AdminFinancialOperations.tsx': 36,
  'components/admin/AdminLoginLockout.tsx': 24,
  'components/admin/AdminMail.tsx': 13,
  'components/admin/AdminPanel.tsx': 16,
  'components/admin/AdminPaymentCreationRequests.tsx': 31,
  'components/admin/AdminPinterestSchedules.tsx': 61,
  'components/admin/AdminSubscriptions.tsx': 25,
  'components/pricing/PricingView.tsx': 12,
  'pages/Contacts.tsx': 36,
  'pages/Landing.tsx': 126,
  'pages/VerifyEmail.tsx': 1,
};
const CEILING_TOTAL = 428;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** Lines carrying Cyrillic outside a comment: the shapes a customer can actually read. */
function stripComments(source: string): string {
  let out = '';
  let index = 0;
  let state: 'code' | 'block' | 'line' = 'code';
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (state === 'code') {
      if (char === '/' && next === '*') { state = 'block'; index += 2; continue; }
      if (char === '/' && next === '/') { state = 'line'; index += 2; continue; }
      out += char; index += 1; continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') { state = 'code'; index += 2; continue; }
      out += char === '\n' ? '\n' : ' ';
      index += 1; continue;
    }
    if (char === '\n') { state = 'code'; out += '\n'; index += 1; continue; }
    index += 1;
  }
  return out;
}

/** Lines carrying Cyrillic that a customer could read, and nothing else. */
function countHardcodedCyrillic(source: string): number {
  return stripComments(source.replace(/\r\n/g, '\n'))
    .split('\n')
    .filter((line) => /[А-яЁё]/.test(line))
    .filter((line) => !/^\s*(console\.(log|warn|error|info)|throw new Error)/.test(line))
    // A regex that matches a Russian backend message is not untranslated UI copy.
    .filter((line) => !/\/\^?[^/]*[А-яЁё][^/]*\/[a-z]*\.test\(/.test(line))
    .length;
}

function measured(): Record<string, number> {
  const files = [
    ...walk(path.join(SRC, 'components')),
    ...walk(path.join(SRC, 'pages')),
    path.join(SRC, 'App.tsx'),
  ];
  const counts: Record<string, number> = {};
  for (const file of files) {
    const count = countHardcodedCyrillic(fs.readFileSync(file, 'utf8'));
    if (count > 0) counts[path.relative(SRC, file).split(path.sep).join('/')] = count;
  }
  return counts;
}

test('the scanner sees a real Russian literal and ignores comments', () => {
  assert.equal(countHardcodedCyrillic("const label = 'Опубликовать';"), 1);
  assert.equal(countHardcodedCyrillic('// комментарий на русском'), 0);
  assert.equal(countHardcodedCyrillic("const label = t.publishing.publishAction;"), 0);
});

test('no component gained a hardcoded Russian line', () => {
  const current = measured();
  const grown: string[] = [];
  for (const [file, count] of Object.entries(current)) {
    const ceiling = CEILING[file];
    if (ceiling === undefined) grown.push(`${file}: new file with ${count} line(s)`);
    else if (count > ceiling) grown.push(`${file}: ${count} > ${ceiling}`);
  }
  assert.deepEqual(grown, [], `hardcoded Russian grew:\n${grown.join('\n')}`);
});

test('the record stays true: fixed files leave the list, the total only shrinks', () => {
  const current = measured();
  const stale = Object.keys(CEILING).filter((file) => current[file] === undefined);
  assert.deepEqual(
    stale,
    [],
    `these files no longer carry hardcoded Russian; remove them from the ceiling: ${stale.join(', ')}`
  );
  const total = Object.values(current).reduce((sum, value) => sum + value, 0);
  assert.ok(total <= CEILING_TOTAL, `total hardcoded lines grew to ${total}, ceiling is ${CEILING_TOTAL}`);
});

const LANGUAGES = ['en', 'es', 'pt', 'de', 'fr', 'zh'] as const;

test('no locale other than Russian carries Cyrillic', () => {
  // Немецкая, французская или китайская строка, оставленная по-русски, - это не перевод,
  // а забытая заглушка. Проверка ловит именно её: кириллица допустима только в ru.ts.
  const offenders: string[] = [];
  for (const lang of LANGUAGES) {
    const source = fs.readFileSync(path.join(SRC, 'i18n', 'locales', `${lang}.ts`), 'utf8');
    const hits = source.split('\n').filter((line) => /[А-яЁё]/.test(line)).length;
    if (hits > 0) offenders.push(`${lang}: ${hits} line(s)`);
  }
  assert.deepEqual(offenders, [], `non-Russian locales carry Cyrillic:\n${offenders.join('\n')}`);
});

test('the app shell itself carries no hardcoded Russian', () => {
  // App.tsx ведёт пользователя через весь продукт: фолбэки названий, ошибка загрузки
  // расписания, экран отказа в доступе и кнопка обновления. Он переведён целиком,
  // поэтому нулевой потолок здесь - требование, а не пожелание.
  const shell = countHardcodedCyrillic(fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8'));
  assert.equal(shell, 0, `App.tsx gained ${shell} hardcoded Russian line(s)`);
});
