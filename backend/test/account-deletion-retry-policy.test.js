"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  MAX_PREFLIGHT_ATTEMPTS,
  MAX_ERASE_ATTEMPTS,
} = require("../accountDeletionWorker");

/**
 * The worker mirrors the SQL retry ceilings so it can report an exhausted job as
 * blocked instead of pretending it will be retried. finish_account_deletion_job in
 * migration 137 owns that policy and returns a bare boolean, so a drift between the
 * two would silently make the worker lie about the state of a deletion.
 *
 * These assertions read the migration rather than trusting a comment.
 */
const MIGRATION = path.resolve(
  __dirname,
  "..",
  "..",
  "db",
  "migrations",
  "137_account_deletion_content_erasure_stage.sql"
);

const sql = fs.readFileSync(MIGRATION, "utf8");

function ceilingsInSql() {
  const found = {};
  const pattern = /v_job\.step_key\s*=\s*'([a-z_]+)'\s*\n?\s*and\s+v_job\.attempts\s*>=\s*(\d+)/g;
  for (const match of sql.matchAll(pattern)) found[match[1]] = Number(match[2]);
  return found;
}

test("the SQL really defines retry ceilings for preflight and erasure", () => {
  const ceilings = ceilingsInSql();
  assert.deepEqual(Object.keys(ceilings).sort(), ["erase_content", "preflight"]);
});

test("the worker mirrors the SQL retry ceilings exactly", () => {
  const ceilings = ceilingsInSql();
  assert.equal(MAX_PREFLIGHT_ATTEMPTS, ceilings.preflight);
  assert.equal(MAX_ERASE_ATTEMPTS, ceilings.erase_content);
});

test("the SQL blocks a job when the ceiling is reached, not after it", () => {
  // The worker uses >= for the same reason: attempt N that hits the ceiling is the
  // attempt that gets blocked.
  assert.match(sql, /or \(v_job\.step_key = 'preflight' and v_job\.attempts >= \d+\)/);
  assert.match(sql, /or \(v_job\.step_key = 'erase_content' and v_job\.attempts >= \d+\)/);
  assert.match(sql, /then 'blocked'/);
});

test("retries are backed off and capped so a failing job cannot spin forever", () => {
  assert.match(sql, /v_delay := least\(3600, 30 \* \(2 \^ least\(v_job\.attempts, 7\)\)::integer\)/);
  assert.match(sql, /v_next_status = 'retry_wait'/);
  assert.match(sql, /next_attempt_at = case when v_next_status = 'retry_wait'/);
});
