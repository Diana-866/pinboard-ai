const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationsDir = path.join(__dirname, "..", "..", "db", "migrations");
const legacyFiles = [
  "002_auth_tokens.sql",
  "003_users_profile.sql",
  "004_onboarding.sql",
  "005_email_verified.sql",
  "006_subscriptions.sql",
  "007_credit_purchases.sql",
  "008_pinterest_accounts.sql",
];
const legacyMarker = "LEGACY / NOT PART OF THE CANONICAL INSTALL";

test("historical 002-008 SQL files are visibly excluded from clean installs", () => {
  for (const file of legacyFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    assert.ok(sql.includes(legacyMarker), `${file} must be marked legacy`);
  }
});

test("canonical migration files 001 and 010-160 exist; 009 stays archived", () => {
  assert.ok(fs.existsSync(path.join(migrationsDir, "001_baseline.sql")));
  assert.equal(fs.existsSync(path.join(migrationsDir, "009_hardening.sql")), false);
  for (let number = 10; number <= 160; number += 1) {
    const prefix = String(number).padStart(3, "0") + "_";
    const matches = fs.readdirSync(migrationsDir).filter((file) => file.startsWith(prefix) && file.endsWith(".sql"));
    assert.equal(matches.length, 1, `expected exactly one canonical migration for ${prefix}`);
  }
});



test("account deletion Storage manifest migrations contain complete SQL guards", () => {
  for (const file of [
    "139_account_deletion_storage_origin_fence.sql",
    "140_account_deletion_review_queue_image_manifest.sql",
    "141_account_deletion_board_cover_manifest.sql",
  ]) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    assert.match(sql, /;\s*commit;\s*$/i, `${file} must end at COMMIT with no trailing SQL`);
    assert.match(sql, /p_supabase_url !~ '[^']*' then/, `${file} must close the Supabase URL regex before THEN`);
    assert.match(sql, /raise exception 'invalid configured Supabase project URL';\s+end if;/);
    assert.match(sql, /select r\.user_id, r\.id into v_user_id, v_request_id\s+from public\.account_deletion_jobs j\s+join public\.account_deletion_requests r/);
  }
});

test("atomic payment integration workflow applies existing migrations in ascending order", () => {
  const workflowPath = path.join(__dirname, "..", "..", ".github", "workflows", "atomic-payment-integration.yml");
  const workflow = fs.readFileSync(workflowPath, "utf8");
  const applied = [...workflow.matchAll(/db\/migrations\/(\d{3}_[^\s]+\.sql)/g)].map((match) => match[1]);
  assert.ok(applied.length > 0, "workflow must apply database migrations");
  // The disposable PostgreSQL workflow must replay every canonical migration,
  // not merely a handful of recent security-sensitive files. A missing file
  // here can otherwise let CI pass while production has a different schema.
  for (let number = 10; number <= 160; number += 1) {
    const prefix = String(number).padStart(3, "0") + "_";
    const canonical = fs.readdirSync(migrationsDir)
      .filter((file) => file.startsWith(prefix) && file.endsWith(".sql"));
    assert.equal(canonical.length, 1, `expected exactly one migration for ${prefix}`);
    assert.ok(applied.includes(canonical[0]), `workflow must apply canonical migration ${canonical[0]}`);
  }
  const numbers = applied.map((file) => Number(file.slice(0, 3)));
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b), "workflow migration order must be ascending");
  assert.equal(new Set(applied).size, applied.length, "workflow must not apply a migration twice");
  for (const file of applied) {
    assert.ok(fs.existsSync(path.join(migrationsDir, file)), `workflow references missing migration ${file}`);
  }
  assert.ok(applied.includes("159_serialize_unfulfilled_payment_markers_with_account_deletion.sql"), "workflow must apply lock-ordered paid liability markers");
  assert.ok(applied.includes("160_block_payment_fulfillment_after_provider_refund.sql"), "workflow must apply provider refund fulfillment guards");
  assert.match(workflow, /backend\/test\/paid-unfulfilled-payment-deletion-lock\.integration\.sql/,
    "workflow must execute the paid-liability deletion-lock integration test");
  assert.match(workflow, /backend\\/test\\/subscription-refund-activation-races\\.integration\\.sql/,
    "workflow must execute subscription refund and delayed-webhook race coverage");
});


test("account deletion finalization rechecks paid-but-unfulfilled financial records", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "158_account_deletion_finalization_financial_recheck.sql"), "utf8");
  assert.match(sql, /status='paid_uncredited' and provider_refunded_at is null/);
  assert.match(sql, /status='paid_unactivated' and provider_refunded_at is null/);
  assert.match(sql, /account_deleted/);
});

test("generation task journal migrations are included in the canonical chain", () => {
  const immutable = fs.readFileSync(path.join(migrationsDir, "148_pin_generation_task_result_immutability.sql"), "utf8");
  const facts = fs.readFileSync(path.join(migrationsDir, "149_pin_generation_task_facts_guard.sql"), "utf8");
  assert.match(immutable, /provider result URL is immutable/);
  assert.match(immutable, /provider price is immutable/);
  assert.match(immutable, /Storage URL is immutable/);
  assert.match(facts, /create trigger pin_generation_task_facts_immutable/);
});


test("pin image deletion path guard uses a literal-dot extension matcher", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "150_fix_pin_image_deletion_path_regex.sql"), "utf8");
  assert.match(sql, /p_object_path !~\* '[^']*\[\.\][^']*'/);
  assert.doesNotMatch(sql, /p_object_path !~\* '[^']*\\\\\.[^']*'/);
  assert.match(sql, /grant execute on function public\.claim_pin_image_deletion\(text,text,integer\)\s+to service_role;/i);
});


test("refunded subscriptions cannot reapply an already-activated entitlement", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "160_block_payment_fulfillment_after_provider_refund.sql"), "utf8");
  const start = sql.indexOf("create or replace function public.activate_paid_subscription");
  assert.notEqual(start, -1, "migration 160 must replace the subscription activation RPC");
  const end = sql.indexOf("$function$;", start);
  assert.notEqual(end, -1, "subscription activation replacement must close its function body");
  const body = sql.slice(start, end);
  assert.match(body, /if v_sub\.provider_refunded_at is not null then[\s\S]*provider refund confirmed/i,
    "activation must reject refunded rows before the already-activated idempotent path");
});

test("paid subscription fallback has a durable provider-paid timestamp column", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "159_serialize_unfulfilled_payment_markers_with_account_deletion.sql"), "utf8");
  assert.match(sql, /alter table public\.subscriptions[\s\S]*add column if not exists provider_paid_at timestamptz/i);
});

test("paid-but-unfulfilled webhook fallback markers serialize on the account owner", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "159_serialize_unfulfilled_payment_markers_with_account_deletion.sql"), "utf8");
  for (const fn of ["record_paid_uncredited_credit_purchase", "record_paid_unactivated_subscription"]) {
    const start = sql.indexOf(`create or replace function public.${fn}`);
    assert.notEqual(start, -1, `${fn} must exist`);
    const end = sql.indexOf("$function$;", start);
    assert.notEqual(end, -1, `${fn} must have a closed function body`);
    const body = sql.slice(start, end);
    assert.match(body, /from public\.users where id::text=v_owner_id for update/i, `${fn} must lock the account owner`);
    assert.match(body, /for update/i, `${fn} must lock the dependent payment row`);
    assert.match(body, /provider_refunded_at is not null|provider_refunded_at/i, `${fn} must preserve refund state`);
  }
  assert.match(sql, /revoke all on function public\.record_paid_uncredited_credit_purchase/i);
  assert.match(sql, /revoke all on function public\.record_paid_unactivated_subscription/i);
});


test("confirmed provider refunds permanently fence payment fulfillment", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "160_block_payment_fulfillment_after_provider_refund.sql"), "utf8");
  assert.match(sql, /old\.provider_refunded_at is not null/i);
  assert.match(sql, /new\.balance_credited_at is distinct from old\.balance_credited_at/i);
  assert.match(sql, /new\.status='success'/i);
  assert.match(sql, /credit_purchases_provider_refund_fulfillment_guard/i);
  assert.match(sql, /subscriptions_provider_refund_fulfillment_guard/i);
});
