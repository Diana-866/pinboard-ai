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

test('upgrade fixture includes the canonical users.is_admin baseline column', () => {
  const fixture = read('backend/test/postgres-integration-upgrade-fixture.sql');
  const usersTable = fixture.match(/create table public\.users \(([\s\S]*?)\n\);/i);
  assert.ok(usersTable, 'upgrade fixture users table must exist');
  assert.match(usersTable[1], /is_admin boolean default false/i);
});

test('upgrade fixture includes the canonical boards.cover_url baseline column', () => {
  const fixture = read('backend/test/postgres-integration-upgrade-fixture.sql');
  const baseline = read('db/migrations/001_baseline.sql');
  const boardsTable = fixture.split('create table public.boards (')[1]?.split('\\n);')[0];
  const canonicalBoardsTable = baseline.split('create table if not exists public.boards (')[1]?.split('\\n);')[0];
  assert.ok(boardsTable, 'upgrade fixture boards table must exist');
  assert.ok(canonicalBoardsTable, 'canonical baseline boards table must exist');
  assert.match(boardsTable, /cover_url text/i);
  assert.match(canonicalBoardsTable, /cover_url text/i);
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

test('runner is UTF-8 BOM encoded for Windows PowerShell 5.1', () => {
  assert.ok(runner.startsWith('\uFEFF'), 'PowerShell runner must include a UTF-8 BOM so Windows PowerShell 5.1 decodes Cyrillic prompts correctly');
});

test('runner normalizes inet server address before exact identity comparison', () => {
  assert.match(runner, /host\(inet_server_addr\(\)\)/);
  assert.match(runner, /coalesce\(host\(inet_server_addr\(\)\), ''\)/);
});

test('runner refuses unsafe targets and documents the unexecuted Bash concurrency suite', () => {
  assert.match(runner, /git -C \$repoRoot fetch origin main/);
  assert.match(runner, /git -C \$repoRoot status --porcelain/);
  assert.match(runner, /Get-NetTCPConnection -State Listen/);
  assert.match(runner, /127\.0\.0\.1/);
  assert.match(runner, /current_setting\('data_directory'\)/);
  assert.match(runner, /current_setting\('server_version_num'\)/);
  assert.match(runner, /PGCLIENTENCODING = 'UTF8'/);
  assert.ok(runner.includes("[ValidateSet('55439')][int]$PostgresPort = 55439"));
  assert.ok(runner.includes("$ExpectedDataDirectory = 'X:\\PinPosy-verify-pg18'"));
  assert.ok(runner.includes("$DatabaseUser = 'pinposy_verify_admin'"));
  assert.ok(runner.includes("$PsqlPath = 'X:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe'"));
  assert.match(runner, /GetFileName\(\$test\) -ne \$test/);
  assert.match(runner, /candidateDatabase\.Length -ne 31/);
  assert.match(runner, /candidateDatabase\.StartsWith\('pinposy_sqlint_'\)/);
  assert.match(runner, /System\.StringComparison\]::OrdinalIgnoreCase/);
  assert.match(runner, /still exists after DROP DATABASE/);
  assert.match(runner, /finally\s*\{/);
  assert.match(runner, /pg_terminate_backend\(pid\).*DROP DATABASE/s);
  assert.match(runner, /NOT RUN: nine Bash concurrency scripts/);
});

test('runner logs migration progress and inspects the preferred-language constraint before migration 018', () => {
  assert.match(runner, /Applying migration /);
  assert.match(runner, /Diagnostic: database and public\.users constraints immediately before migration 018:/);
  assert.match(runner, /users_preferred_language_check/);
  assert.match(runner, /pg_get_constraintdef\(c\.oid\)/);
});


test('catalog diagnostic casts PostgreSQL internal char fields before text concatenation', () => {
  assert.match(runner, /c\.contype::text/);
  assert.match(runner, /cl\.relkind::text/);
});

test('runner emits database and users constraint diagnostics plus verbose SQL errors', () => {
  assert.match(runner, /DATABASE\|' \|\| current_database\(\)/);
  assert.match(runner, /USER_CONSTRAINT\|/);
  assert.match(runner, /NAMED_CONSTRAINT\|/);
  assert.match(runner, /NAMED_RELATION\|/);
  assert.match(runner, /VERBOSITY=verbose/);
  assert.match(runner, /SHOW_CONTEXT=always/);
  assert.match(runner, /--echo-errors/);
});

test('psql stderr notices do not abort before the native exit code is captured', () => {
  assert.match(runner, /\$previousErrorActionPreference = \$ErrorActionPreference/);
  assert.match(runner, /\$ErrorActionPreference = 'Continue'/);
  assert.match(runner, /\$output = @\(& \$PsqlPath @arguments 2>&1\)/);
  assert.match(runner, /\$exitCode = \$LASTEXITCODE/);
  assert.match(runner, /finally\s*\{\s*\[Console\]::OutputEncoding = \$previousConsoleOutputEncoding\s*\$ErrorActionPreference = \$previousErrorActionPreference/s);
});

test('psql native output is decoded as UTF-8 only for the duration of invocation', () => {
  assert.match(runner, /\$previousConsoleOutputEncoding = \[Console\]::OutputEncoding/);
  assert.match(runner, /\[Console\]::OutputEncoding = \[Text\.UTF8Encoding\]::new\(\$false\)/);
  assert.match(runner, /\[Console\]::OutputEncoding = \$previousConsoleOutputEncoding/);
});

test('schedule cancellation race test compares text user_id with an explicit UUID-to-text cast', () => {
  const cancellation = read('backend/test/pinterest-schedule-cancellation-race.integration.sql');
  assert.equal((cancellation.match(/user_id=v_user_id::text and status='scheduled'/g) || []).length, 2);
  assert.doesNotMatch(cancellation, /user_id=v_user_id and status='scheduled'/);
});

test('account deletion re-auth integration test rolls back durable queue and append-only event rows', () => {
  const reauth = read('backend/test/account-deletion-reauth-version.integration.sql');
  const transactionStart = reauth.indexOf('begin;');
  const doBlock = reauth.indexOf('do $$');
  assert.ok(transactionStart >= 0 && transactionStart < doBlock);
  assert.ok(reauth.trimEnd().endsWith('rollback;'));
  const normalized = reauth.toLowerCase();
  assert.ok(!normalized.includes('delete from public.account_deletion_requests'));
  assert.ok(!normalized.includes('delete from public.account_deletion_jobs'));
  assert.ok(!normalized.includes('delete from public.account_deletion_events'));
  assert.ok(!normalized.includes('delete from public.users'));
});
test('durable account deletion queue test expects the Storage manifest guard added by migration 144', () => {
  const durableQueue = read('backend/test/account-deletion-durable-queue.integration.sql');
  const stageGuards = read('db/migrations/144_account_deletion_stage_completion_guards.sql');
  assert.ok(durableQueue.includes("if sqlerrm <> 'account deletion Storage manifest is required' then raise; end if;"));
  assert.ok(stageGuards.includes("raise exception 'account deletion Storage manifest is required';"));
  assert.ok(stageGuards.indexOf("raise exception 'account deletion Storage manifest is required';") < stageGuards.indexOf('update public.account_deletion_jobs'));
});

test('CI migration list remains the complete contiguous 010-148 chain', () => {
  const prefixes = [...workflow.matchAll(/db\/migrations\/(\d{3})_[A-Za-z0-9._-]+\.sql/g)]
    .map((match) => Number(match[1]));
  assert.equal(prefixes.length, 139);
  assert.deepEqual(prefixes, Array.from({ length: 139 }, (_, index) => index + 10));
});
