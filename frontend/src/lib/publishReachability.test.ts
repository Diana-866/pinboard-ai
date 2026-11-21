import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Section 162. `PublishPinButton` was the only code that calls `POST /pins/:id/publish`, and **no screen
 * imported it**. A customer could approve a pin and schedule it, but could not publish it on demand — and the
 * "publication outcome unknown, do not resend" message (§131) lived inside a component nothing rendered.
 *
 * Two claims are pinned here:
 *   1. the publishing control is mounted by a screen that the app actually shows;
 *   2. it stays the only writer of that endpoint (a second copy would duplicate the safety logic).
 */

const root = process.cwd();

function sourceFiles(dir = 'src', acc: string[] = []): string[] {
  for (const entry of readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(root, rel)).isDirectory()) sourceFiles(rel, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) acc.push(rel);
  }
  return acc;
}

const files = sourceFiles();
const sources = new Map(files.map((file) => [file, readFileSync(path.join(root, file), 'utf8')]));
const BUTTON = 'src/components/pins/PublishPinButton.tsx';

test('the scan sees the component tree', () => {
  assert.ok(files.length > 80, `expected the whole src tree, got ${files.length}`);
  assert.ok(sources.has(BUTTON));
});

test('the publishing control is imported by a live screen', () => {
  const importers = [...sources]
    .filter(([file, text]) => file !== BUTTON && /from '[^']*PublishPinButton'/.test(text))
    .map(([file]) => file);
  assert.ok(importers.length >= 1, 'nothing imports PublishPinButton: publishing is unreachable from the UI');
  assert.ok(importers.includes('src/components/review/ManualApprovalDesk.tsx'), importers.join('\n'));
});

test('the importing screen renders it with a persisted pin id', () => {
  const desk = sources.get('src/components/review/ManualApprovalDesk.tsx') ?? '';
  assert.match(desk, /<PublishPinButton/);
  assert.match(desk, /pinId=\{currentPin\.pinId\}/);
  assert.match(desk, /currentPin\.pinId &&/);
});

test('the publish endpoint stays in one place', () => {
  const callers = [...sources]
    .filter(([, text]) => /\/publish`/.test(text))
    .map(([file]) => file);
  assert.deepEqual(callers, [BUTTON], `unexpected callers:\n${callers.join('\n')}`);
});
