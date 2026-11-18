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

test("canonical migration files 001 and 010-159 exist; 009 stays archived", () => {
  assert.ok(fs.existsSync(path.join(migrationsDir, "001_baseline.sql")));
  assert.equal(fs.existsSync(path.join(migrationsDir, "009_hardening.sql")), false);
  for (let number = 10; number <= 159; number += 1) {
    const prefix = String(number).padStart(3, "0") + "_";
    const matches = fs.readdirSync(migrationsDir).filter((file) => file.startsWith(prefix) && file.endsWith(".sql"));
    assert.equal(matches.length, 1, `expected exactly one canonical migration for ${prefix}`);
  }
});
