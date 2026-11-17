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
  const actual = fixture.split(/\r?\n/).join('\n').trimEnd();
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
  const boardsTable = fixture.split('create table public.boards (')[1]?.split(');')[0];
  const canonicalBoardsTable = baseline.split('create table if not exists public.boards (')[1]?.split(');')[0];
  assert.ok(boardsTable, 'upgrade fixture boards table must exist');
  assert.ok(canonicalBoardsTable, 'canonical baseline boards table must exist');
  assert.match(boardsTable, /cover_url\s+text/i);
  assert.match(canonicalBoardsTable, /cover_url\s+text/i);
});

test('upgrade fixture preserves baseline project-to-board and board-to-pin cascade deletes', () => {
  const fixture = read('backend/test/postgres-integration-upgrade-fixture.sql');
  const boardsTable = fixture.split('create table public.boards (')[1]?.split(');')[0];
  const pinsTable = fixture.split('create table public.pins (')[1]?.split(');')[0];
  assert.ok(boardsTable, 'upgrade fixture boards table must exist');
  assert.ok(pinsTable, 'upgrade fixture pins table must exist');
  assert.match(boardsTable, /project_id\s+uuid(?:\s+not null)?\s+references public\.projects\s*\(id\)\s+on delete cascade/i);
  assert.match(pinsTable, /board_id\s+uuid(?:\s+not null)?\s+references public\.boards\s*\(id\)\s+on delete cascade/i);
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

test('CI migration list remains the complete contiguous 010-149 chain', () => {
  const prefixes = [...workflow.matchAll(/db\/migrations\/(\d{3})_[A-Za-z0-9._-]+\.sql/g)]
    .map((match) => Number(match[1]));
  assert.equal(prefixes.length, 140);
  assert.deepEqual(prefixes, Array.from({ length: 140 }, (_, index) => index + 10));
});

test('upgrade fixture preserves every canonical baseline column except fields introduced by later migrations', () => {
  const fixture = read('backend/test/postgres-integration-upgrade-fixture.sql');
  const baseline = read('db/migrations/001_baseline.sql');
  const columns = (source, table) => {
    const definition = new RegExp(
      'create table(?: if not exists)? public\\.' + table + ' \\(([\s\S]*?)\\n\\);',
      'i'
    ).exec(source);
    assert.ok(definition, 'table ' + table + ' must exist');
    return definition[1].split(/\r?\n/).map((line) =>
      line.trim().match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1]
    ).filter(Boolean);
  };
  for (const table of [
    'users', 'projects', 'boards', 'pins', 'credit_transactions',
    'auth_tokens', 'subscriptions', 'credit_purchases',
    'pinterest_accounts', 'pinterest_publications'
  ]) {
    const missing = columns(baseline, table).filter((column) =>
      !columns(fixture, table).includes(column)
    );
    assert.deepEqual(missing, table === 'users' ? ['token_version'] : [], table + ' baseline columns');
  }
  const users = fixture.match(/create table public\.users \(([\s\S]*?)\n\);/i)?.[1] || '';
  assert.doesNotMatch(users, /\btoken_version\b|\baccount_status\b/);
  assert.match(read('db/migrations/023_revoke_sessions_after_password_reset.sql'), /add column if not exists token_version integer not null default 0/i);
  assert.match(read('db/migrations/055_auth_token_version.sql'), /add column if not exists token_version integer/i);
  assert.match(read('db/migrations/127_account_lifecycle.sql'), /add column if not exists account_status/i);
});

test('upgrade fixture preserves baseline nullability, defaults, cascades and timestamp types', () => {
  const fixture = read('backend/test/postgres-integration-upgrade-fixture.sql');
  const users = fixture.match(/create table public\.users \(([\s\S]*?)\n\);/i)?.[1] || '';
  const projects = fixture.match(/create table public\.projects \(([\s\S]*?)\n\);/i)?.[1] || '';
  const boards = fixture.match(/create table public\.boards \(([\s\S]*?)\n\);/i)?.[1] || '';
  const pins = fixture.match(/create table public\.pins \(([\s\S]*?)\n\);/i)?.[1] || '';
  const transactions = fixture.match(/create table public\.credit_transactions \(([\s\S]*?)\n\);/i)?.[1] || '';
  const authTokens = fixture.match(/create table public\.auth_tokens \(([\s\S]*?)\n\);/i)?.[1] || '';
  assert.match(users, /credits_balance integer default 0/i);
  assert.doesNotMatch(users, /credits_balance integer not null/i);
  assert.match(projects, /user_id uuid references public\.users\(id\)/i);
  assert.doesNotMatch(projects, /user_id uuid not null/i);
  assert.match(boards, /project_id uuid references public\.projects\(id\) on delete cascade/i);
  assert.match(boards, /status text default 'new'/i);
  assert.match(pins, /board_id uuid references public\.boards\(id\) on delete cascade/i);
  assert.match(transactions, /created_at timestamp without time zone default now\(\)/i);
  assert.match(authTokens, /created_at timestamptz default now\(\)/i);
});


test('provider refund regeneration finalizer preserves NOT NULL claim token', () => {
  const migration = read('db/migrations/077_finalize_reconciled_provider_failures.sql');
  const schema = read('db/migrations/053_pin_regeneration_journal.sql');
  const start = migration.indexOf('create or replace function public.finalize_reconciled_pin_regeneration_failure');
  assert.notEqual(start, -1);
  const regenerationFinalizer = migration.slice(start);
  assert.match(schema, /claim_token uuid not null default gen_random_uuid\(\)/i);
  assert.match(regenerationFinalizer, /set status='failed',[\s\S]*?error_code='provider_refund_reconciled'/i);
  assert.doesNotMatch(regenerationFinalizer, /claim_token\s*=\s*null/i);
});
