const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const workflow = read('.github/workflows/atomic-payment-integration.yml');
const runner = read('scripts/verify-integration.ps1');

function stripWorkflowIndent(source) {
  return source.split(/\r?\n/).map((line) => line.replace(/^          /, '')).join('\n');
}

function extractHeredocAfter(marker) {
  const markerIndex = workflow.indexOf(marker);
  assert.notEqual(markerIndex, -1, 'workflow heredoc marker must exist');
  const start = workflow.indexOf("<<'SQL'\n", markerIndex);
  assert.notEqual(start, -1, 'workflow SQL heredoc must exist');
  const bodyStart = start + "<<'SQL'\n".length;
  const end = workflow.indexOf('\n          SQL', bodyStart);
  assert.notEqual(end, -1, 'workflow SQL heredoc terminator must exist');
  return stripWorkflowIndent(workflow.slice(bodyStart, end));
}

function extractInlineDoBlocks() {
  return [...workflow.matchAll(/^[ \t]*do \$body\$\r?\n[\s\S]*?^[ \t]*\$body\$;/gm)]
    .map((match) => stripWorkflowIndent(match[0]));
}

test('upgrade fixture stays byte-for-byte aligned with CI legacy schema setup', () => {
  const fixture = read('backend/test/postgres-integration-upgrade-fixture.sql');
  const workflowFixture = extractHeredocAfter('name: Prepare disposable schema');
  const expected = workflowFixture.split(/\r?\n/).filter((line) =>
    !/^create role (anon|authenticated|service_role)\b/i.test(line.trim())
  ).join('\n');
  const actual = fixture.split(/\r?\n/).filter((line) =>
    !line.startsWith('-- CI upgrade-compatibility fixture.')
  ).join('\n').trimEnd();
  assert.equal(actual, expected.trimEnd());
});

test('both extracted inline assertions stay aligned with CI workflow', () => {
  const blocks = extractInlineDoBlocks();
  assert.equal(blocks.length, 2);
  const deletion = read('backend/test/postgres-integration-pinterest-deletion-check.sql')
    .split(/\r?\n/).filter((line) => !line.startsWith('-- CI inline assertion:')).join('\n').trimEnd();
  const refresh = read('backend/test/postgres-integration-refresh-fence-check.sql')
    .split(/\r?\n/).filter((line) => !line.startsWith('-- CI inline assertion:')).join('\n').trimEnd();
  assert.equal(deletion, blocks[0].trimEnd());
  assert.equal(refresh, blocks[1].trimEnd());
});

test('SQL manifest exactly preserves all CI SQL integration tests in order', () => {
  const expected = [...workflow.matchAll(/-f backend\/test\/([A-Za-z0-9._-]+\.sql)/g)].map((match) => match[1]);
  const actual = read('backend/test/postgres-integration-sql-manifest.txt')
    .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  assert.equal(expected.length, 46);
  assert.deepEqual(actual, expected);
  for (const filename of actual) assert.ok(fs.existsSync(path.join(root, 'backend/test', filename)), filename);
});

test('runner refuses unsafe targets and documents the unexecuted Bash concurrency suite', () => {
  assert.match(runner, /git -C \$repoRoot fetch origin main/);
  assert.match(runner, /git -C \$repoRoot status --porcelain/);
  assert.match(runner, /Get-NetTCPConnection -State Listen/);
  assert.match(runner, /127\.0\.0\.1/);
  assert.match(runner, /current_setting\('data_directory'\)/);
  assert.match(runner, /current_setting\('server_version_num'\)/);
  assert.match(runner, /PGCLIENTENCODING = 'UTF8'/);
  assert.match(runner, /finally\s*\{/);
  assert.match(runner, /pg_terminate_backend\(pid\).*DROP DATABASE/s);
  assert.match(runner, /NOT RUN: nine Bash concurrency scripts/);
});

test('CI migration list remains the complete contiguous 010-148 chain', () => {
  const prefixes = [...workflow.matchAll(/db\/migrations\/(\d{3})_[A-Za-z0-9._-]+\.sql/g)]
    .map((match) => Number(match[1]));
  assert.equal(prefixes.length, 139);
  assert.deepEqual(prefixes, Array.from({ length: 139 }, (_, index) => index + 10));
});
