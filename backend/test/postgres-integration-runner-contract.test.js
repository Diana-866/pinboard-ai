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
  assert.equal(expected.length, 49);
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
  assert.match(runner, /NOT RUN: ten Bash concurrency scripts/);
});

test('runner logs migration progress and inspects the preferred-language constraint before migration 018', () => {
  assert.match(runner, /Applying migration /);
  assert.match(runner, /Diagnostic: database and public\.users constraints immediately before migration 018:/);
  assert.match(runner, /users_preferred_language_check/);
  assert.match(runner, /pg_get_constraintdef\(c\.oid\)/);
  assert.match(runner, /\$migrations\.Count -ne 152/);
  assert.match(runner, /Expected 152 active migrations 010-161/);
  assert.match(runner, /Applying 152 migrations 010-161/);
  assert.match(runner, /\$sqlTests\.Count -ne 49/);
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

test('CI migration list remains the complete contiguous 010-161 chain', () => {
  const prefixes = [...workflow.matchAll(/db\/migrations\/(\d{3})_[A-Za-z0-9._-]+\.sql/g)]
    .map((match) => Number(match[1]));
  assert.equal(prefixes.length, 152);
  assert.deepEqual(prefixes, Array.from({ length: 152 }, (_, index) => index + 10));
});

test('upgrade fixture preserves every canonical baseline column except fields introduced by later migrations', () => {
  const fixture = read('backend/test/postgres-integration-upgrade-fixture.sql');
  const baseline = read('db/migrations/001_baseline.sql');
  const columns = (source, table) => {
    const definition = new RegExp(
      'create table(?: if not exists)? public\\.' + table + ' \\(([\\s\\S]*?)\\n\\);',
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
  const migration = read('db/migrations/150_preserve_regeneration_claim_token_on_refund_finalization.sql');
  const schema = read('db/migrations/053_pin_regeneration_journal.sql');
  const start = migration.indexOf('create or replace function public.finalize_reconciled_pin_regeneration_failure');
  assert.notEqual(start, -1);
  const regenerationFinalizer = migration.slice(start);
  assert.match(schema, /claim_token uuid not null default gen_random_uuid\(\)/i);
  assert.match(regenerationFinalizer, /set status='failed',[\s\S]*?error_code='provider_refund_reconciled'/i);
  assert.doesNotMatch(regenerationFinalizer, /claim_token\s*=\s*null/i);
});


test('provider refund evidence regex uses PostgreSQL-safe unbounded repetition in migration 151', () => {
  const migration = read('db/migrations/151_fix_provider_refund_evidence_regex_repetition_limit.sql');
  assert.match(migration, /drop constraint provider_refund_operator_actions_shape_check/i);
  assert.match(migration, /\{7,\}/);
  assert.match(migration, /pg_get_functiondef/);
  assert.match(migration, /replace\(v_definition, '\{7,499\}', '\{7,\}'\)/);
  assert.equal((migration.match(/\{7,499\}/g) || []).length, 1);
});

test('migration 153 permanently quarantines expired external image deletion claims', () => {
  const migration = read('db/migrations/153_restore_permanent_quarantine_for_expired_pin_image_deletions.sql');
  assert.match(migration, /if v_state = 'deleting' then[\s\S]*?if v_claim_expires_at > now\(\)[\s\S]*?state = 'quarantined'[\s\S]*?reason', 'path_quarantined'/i);
  assert.match(migration, /pin_generation_requests[\s\S]*?boards[\s\S]*?pin_review_queue/i);
  assert.doesNotMatch(migration, /retry the[\s\S]*?Storage removal/i);
});

test('migration 155 restores regeneration replay image references without weakening permanent quarantine', () => {
  const migration = read('db/migrations/155_restore_regeneration_replay_image_reference_to_deletion_claim.sql');
  assert.match(migration, /r\.result_pin ->> 'image_url'[\s\S]*?into v_has_reference/i);
  assert.match(migration, /if v_state = 'deleting'[\s\S]*?stale_delete_quarantined[\s\S]*?if v_state = 'deleted'[\s\S]*?already_deleted/i);
  assert.match(migration, /pin_generation_requests[\s\S]*?boards[\s\S]*?pin_review_queue/i);
  assert.ok(migration.includes('revoke all on function public.activate_paid_subscription') && migration.includes('from public, anon, authenticated'));
});

test('migration 154 preserves deleted image path tombstones and migration 145 reference inventory', () => {
  const migration = read('db/migrations/154_restore_permanent_tombstone_guard_for_deleted_pin_image_uploads.sql');
  assert.match(migration, /if v_state = 'quarantined'[\s\S]*?reason', 'path_quarantined'[\s\S]*?if v_state = 'deleted'[\s\S]*?reason', 'already_deleted'/i);
  assert.match(migration, /pin_generation_requests[\s\S]*?boards[\s\S]*?pin_review_queue/i);
  assert.ok(migration.includes('revoke all on function public.activate_paid_subscription') && migration.includes('from public, anon, authenticated'));
});


test('migration 156 restores regeneration replay image references to upload reservations', () => {
  const migration = read('db/migrations/156_restore_regeneration_replay_image_reference_to_upload_reservation.sql');
  assert.match(migration, /r\.result_pin ->> 'image_url'[\s\S]*?into v_has_reference/i);
  assert.match(migration, /if v_state = 'quarantined'[\s\S]*?path_quarantined[\s\S]*?if v_state = 'deleted'[\s\S]*?already_deleted/i);
  assert.match(migration, /pin_generation_requests[\s\S]*?boards[\s\S]*?pin_review_queue/i);
  assert.ok(migration.includes('revoke all on function public.activate_paid_subscription') && migration.includes('from public, anon, authenticated'));
});

test('migration 152 revokes direct execution of the regeneration reservation trigger function', () => {
  const migration = read('db/migrations/152_revoke_direct_execution_of_regeneration_reservation_trigger.sql');
  assert.ok(migration.includes('revoke all on function public.activate_paid_subscription') && migration.includes('from public, anon, authenticated'));
  assert.match(migration, /from public, anon, authenticated, service_role/i);
});

test('Pinterest OAuth password-reset assertion preserves existing credentials while rejecting stale callback', () => {
  const oauthTest = read('backend/test/pinterest-oauth.integration.sql');
  assert.match(oauthTest, /v_committed->>'reason'\s*<>\s*'stale_session'/);
  assert.match(oauthTest, /pinterest_user_id = 'pinterest-user-current'[\s\S]*?username = 'reconnected_user'[\s\S]*?access_token = 'enc:reconnected-access'[\s\S]*?refresh_token = 'enc:reconnected-refresh'[\s\S]*?disconnected_at is null/);
  assert.match(oauthTest, /pinterest_user_id = 'pinterest-user-old-session'/);
  assert.match(oauthTest, /password-reset stale callback created an old-session Pinterest account/);
  assert.doesNotMatch(oauthTest, /stale OAuth callback left active credentials after token-version change/);
});

test('Pinterest publication fixtures satisfy the approved-pin precondition before publication guards', () => {
  const publicationTest = read('backend/test/pinterest-account-publication.integration.sql');
  const migration = read('db/migrations/148_atomic_pin_publication_status_fencing.sql');
  assert.match(publicationTest, /multi-account\.png', 'Multi account', '', 'approved', 'flux-schnell', 0\)/i, 'the primary pin is published immediately and must be approved');
  assert.match(publicationTest, /legacy\.png', 'Legacy pin', '', 'approved', 'flux-schnell', 0\)/i, 'the legacy-history pin must pass the approval guard to reach the history fence');
  const scheduledFixtures = [
    [/inflight\.png', 'In-flight pin', '', 'approved', 'flux-schnell', 0\)/i, 'in-flight schedule pin must be approved'],
    [/pre-journal-crash\.png', 'Pre-journal crash', '', 'approved', 'flux-schnell', 0\)/i, 'pre-journal recovery pin must be approved'],
    [/safe-crash\.png', 'Safe crash', '', 'approved', 'flux-schnell', 0\)/i, 'safe-crash recovery pin must be approved'],
    [/unsafe-crash\.png', 'Unsafe crash', '', 'approved', 'flux-schnell', 0\)/i, 'unsafe-crash recovery pin must be approved'],
    [/retry\.png', 'Retry pin', '', 'approved', 'flux-schnell', 0\)/i, 'retry-backoff pin must be approved'],
    [/manual-retry\.png', 'Manual retry pin', '', 'approved', 'flux-schnell', 0\)/i, 'manual-retry pin must be approved'],
    [/attempt-retry\.png', 'Attempt retry pin', '', 'approved', 'flux-schnell', 0\)/i, 'attempt-retry pin must be approved'],
    [/safe-retry\.png', 'Safe retry pin', '', 'approved', 'flux-schnell', 0\)/i, 'safe-retry pin must be approved'],
    [/disconnect-race\.png', 'Disconnect race', '', 'approved', 'flux-schnell', 0\)/i, 'disconnect-race pin must be approved']
  ];
  for (const [fixture, message] of scheduledFixtures) {
    assert.match(publicationTest, fixture, message);
  }
  const scheduleGuardStart = migration.indexOf('create or replace function public.guard_pin_schedule_insert_requires_approved_pin()');
  assert.notEqual(scheduleGuardStart, -1, 'schedule insert approval guard must exist');
  const scheduleGuardBody = migration.slice(scheduleGuardStart, migration.indexOf('$function$;', scheduleGuardStart));
  assert.match(scheduleGuardBody, /if v_status is distinct from 'approved' then[\s\S]*?only approved pins can be scheduled/i);
  assert.match(migration, /create trigger guard_pin_schedule_insert_requires_approved_pin\s+before insert on public\.pin_schedules/i);
  assert.match(publicationTest, /legacy publication history did not reach the manual-reconciliation fence: %/i);
  const functionStart = migration.indexOf('create or replace function public.begin_pinterest_publish_v2(');
  assert.notEqual(functionStart, -1, 'active publication reservation function must exist');
  const functionBody = migration.slice(functionStart);
  const approvalGuard = functionBody.indexOf("if v_pin_status is distinct from 'approved' then");
  const legacyHistoryGuard = functionBody.indexOf('Legacy publication history has no verified Pinterest account mapping');
  assert.ok(approvalGuard >= 0 && legacyHistoryGuard > approvalGuard,
    'fixture pin must be approved so the call reaches the later legacy-history guard');
});


test('migration 159 atomically binds receipt decisions to credit and subscription fulfillment', () => {
  const migration = read('db/migrations/159_atomic_prodamus_receipt_entitlement_fulfillment.sql');
  const integration = read('backend/test/payment-provider-receipt-fulfillment.integration.sql');
  assert.match(migration, /create or replace function public\.credit_paid_purchase_with_receipt/i);
  assert.match(migration, /create or replace function public\.activate_paid_subscription_with_receipt/i);
  for (const functionName of ['credit_paid_purchase_with_receipt', 'activate_paid_subscription_with_receipt']) {
    const start = migration.indexOf('function public.' + functionName);
    assert.ok(start >= 0);
    const body = migration.slice(start);
    assert.match(body, /from public\.users[\s\S]*?for update[\s\S]*?from public\.(?:credit_purchases|subscriptions)[\s\S]*?for update[\s\S]*?from public\.payment_entitlement_decisions[\s\S]*?for update/i);
  }
  assert.match(integration, /decision.*granted/i);
  assert.match(integration, /withheld_account_lifecycle/i);
  assert.match(integration, /rejected_mismatch/i);
  assert.match(integration, /exactly once/i);
  assert.ok(workflow.includes('db/migrations/159_atomic_prodamus_receipt_entitlement_fulfillment.sql'));
  assert.ok(workflow.includes('backend/test/payment-provider-receipt-fulfillment.integration.sql'));
});

test('migration 158 creates an immutable receipt journal with restricted RPC access', () => {
  const migration = read('db/migrations/158_prodamus_immutable_receipt_and_decision_journal.sql');
  const integration = read('backend/test/payment-provider-receipts.integration.sql');
  assert.match(migration, /create table if not exists public\.payment_provider_receipts/i);
  assert.match(migration, /create table if not exists public\.payment_entitlement_decisions/i);
  assert.match(migration, /before update or delete on public\.payment_provider_receipts/i);
  assert.match(migration, /on conflict \(provider, event_hash\) do nothing/i);
  assert.match(migration, /revoke all on public\.payment_provider_receipts[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.record_prodamus_payment_receipt[\s\S]*?to service_role/i);
  assert.match(migration, /grant execute on function public\.set_prodamus_payment_decision[\s\S]*?to service_role/i);
  assert.match(integration, /provider receipt UPDATE was not rejected/i);
  assert.match(integration, /terminal decision was allowed to be overwritten/i);
  assert.ok(workflow.includes('db/migrations/158_prodamus_immutable_receipt_and_decision_journal.sql'));
  assert.ok(workflow.includes('backend/test/payment-provider-receipts.integration.sql'));
});

test('migration 157 aligns paid fulfillment lock order with account deletion and fences inactive accounts', () => {
  const migration = read('db/migrations/157_payment_fulfillment_user_first_lifecycle_fence.sql');
  const creditStart = migration.indexOf('create or replace function public.credit_paid_purchase');
  const subscriptionStart = migration.indexOf('create or replace function public.activate_paid_subscription');
  assert.ok(creditStart >= 0 && subscriptionStart > creditStart);
  const credit = migration.slice(creditStart, subscriptionStart);
  const subscription = migration.slice(subscriptionStart);
  for (const [name, body, paymentTable] of [
    ['credit', credit, 'credit_purchases'],
    ['subscription', subscription, 'subscriptions']
  ]) {
    const ownerLookup = body.indexOf(`select user_id into v_user_id`);
    const userLock = body.indexOf('from public.users', ownerLookup);
    const paymentLock = body.indexOf(`from public.${paymentTable}`, userLock + 1);
    const lifecycleFence = body.indexOf("v_user.account_status is distinct from 'active'");
    assert.ok(ownerLookup >= 0 && userLock > ownerLookup, name + ' resolves owner then locks user');
    assert.ok(paymentLock > userLock, name + ' locks payment after user');
    assert.ok(lifecycleFence > paymentLock, name + ' checks lifecycle before entitlement mutation');
    assert.match(body, /set search_path = pg_catalog, public/i);
  }
  assert.ok(migration.includes('revoke all on function public.credit_paid_purchase') && migration.includes('from public, anon, authenticated'));
  assert.ok(migration.includes('revoke all on function public.activate_paid_subscription') && migration.includes('from public, anon, authenticated'));
  const integration = read('backend/test/payment-deletion-lifecycle-fence.integration.sql');
  assert.match(integration, /account_status[\\s\\S]*?deletion_pending/i);
  assert.match(integration, /purchase is not active|purchase user is not active/i);
  assert.match(integration, /subscription user is not active/i);
  assert.match(integration, /balance_credited_at is null/i);
  assert.ok(workflow.includes('db/migrations/157_payment_fulfillment_user_first_lifecycle_fence.sql'));
  assert.ok(workflow.includes('backend/test/payment-deletion-lifecycle-fence.integration.sql'));
});

test('migration 161 prevents service_role from independently asserting granted decisions', () => {
  const migration = read('db/migrations/161_restrict_granted_decisions_to_atomic_fulfillment.sql');
  const integration = read('backend/test/payment-provider-receipts.integration.sql');
  assert.match(migration, /if p_decision is null or p_decision not in \([\s\S]*?'ignored_non_success'/i);
  assert.match(migration, /create or replace function public\.mark_prodamus_entitlement_granted/i);
  assert.match(migration, /revoke all on function public\.mark_prodamus_entitlement_granted[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.set_prodamus_payment_decision[\s\S]*?to service_role/i);
  assert.match(integration, /service_role must not independently assert a granted entitlement/i);
  assert.match(integration, /general decision RPC was allowed to assert granted/i);
  assert.ok(workflow.includes('db/migrations/161_restrict_granted_decisions_to_atomic_fulfillment.sql'));
});
