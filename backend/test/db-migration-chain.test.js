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
    assert.match(sql, /;\s*commit;\s*$/i, `${file} must end at COMMIT with no trailing SQL`);
    assert.ok(sql.includes(legacyMarker), `${file} must be marked legacy`);
  }
});

test("canonical migration files 001 and 010-147 exist; 009 stays archived", () => {
  assert.ok(fs.existsSync(path.join(migrationsDir, "001_baseline.sql")));
  assert.equal(fs.existsSync(path.join(migrationsDir, "009_hardening.sql")), false);
  for (let number = 10; number <= 147; number += 1) {
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
  const numbers = applied.map((file) => Number(file.slice(0, 3)));
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b), "workflow migration order must be ascending");
  assert.equal(new Set(applied).size, applied.length, "workflow must not apply a migration twice");
  for (const file of applied) {
    assert.ok(fs.existsSync(path.join(migrationsDir, file)), `workflow references missing migration ${file}`);
  }
});
