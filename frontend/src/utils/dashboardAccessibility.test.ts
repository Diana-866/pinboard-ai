import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/dashboard/DashboardView.tsx', import.meta.url), 'utf8');

test('dashboard board cards are native keyboard-reachable buttons', () => {
  assert.match(source, /<button\s+key=\{board\.id\}\s+type="button"[\s\S]*?onClick=\{\(\) => onNavigateTab\('boards'\)\}/);
  assert.match(source, /focus-visible:ring-2 focus-visible:ring-accent/);
  assert.doesNotMatch(source, /<div\s+key=\{board\.id\}\s+onClick=\{\(\) => onNavigateTab\('boards'\)\}/);
});
