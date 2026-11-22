"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

// The module reads Supabase directly, so the client is replaced before loading it.
const supabasePath = require.resolve("../supabase");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {},
};
const modulePath = require.resolve("../adminAccountDeletionInventory");
delete require.cache[modulePath];
const {
  getAccountDeletionInventory,
  parseLimit,
  JOB_STATUSES,
  REQUEST_STATES,
} = require("../adminAccountDeletionInventory");

const REQUEST_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/** Scripted PostgREST double: counts per (table,column,value), plus row lists. */
function createDb({ counts = {}, lists = {}, errors = {} } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const state = { table, filters: [], columns: null, limit: null, order: null, head: false };
      const key = () => `${table}:${state.filters.map(([, , value]) => value).join(",")}`;
      const builder = {
        select(columns, options = {}) {
          state.columns = columns;
          state.head = options.head === true;
          calls.push({ table, columns, head: state.head });
          return builder;
        },
        eq(column, value) { state.filters.push([column, "eq", value]); return builder; },
        in(column, values) { state.filters.push([column, "in", values]); return builder; },
        order(column, options) { state.order = [column, options]; return builder; },
        limit(value) { state.limit = value; return builder; },
        then(resolve, reject) {
          if (errors[key()]) return Promise.resolve({ data: null, count: null, error: errors[key()] }).then(resolve, reject);
          if (state.head) {
            const count = counts[key()];
            return Promise.resolve({ data: null, count, error: null }).then(resolve, reject);
          }
          const data = Object.hasOwn(lists, key()) ? lists[key()] : [];
          return Promise.resolve({ data, count: null, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function baseScenario(overrides = {}) {
  const counts = {};
  for (const state of REQUEST_STATES) counts[`account_deletion_requests:${state}`] = 0;
  for (const status of JOB_STATUSES) counts[`account_deletion_jobs:${status}`] = 0;
  counts["account_deletion_requests:pending"] = 3;
  counts["account_deletion_jobs:blocked"] = 1;
  const lists = {
    "account_deletion_requests:pending": [{ id: REQUEST_ID, requested_at: "2026-11-18T08:00:00.000Z" }],
    "account_deletion_jobs:blocked,retry_wait,running": [{
      id: "8f2c1c8e-4a52-4a1f-9d43-1f0e4c3b7a11",
      request_id: REQUEST_ID,
      step_key: "erase_content",
      status: "blocked",
      attempts: 100,
      safe_error_code: "storage_manifest_batch_remaining",
      next_attempt_at: null,
      updated_at: "2026-11-18T08:30:00.000Z",
    }],
  };
  return {
    counts: { ...counts, ...(overrides.counts || {}) },
    lists: { ...lists, ...(overrides.lists || {}) },
    errors: { ...(overrides.errors || {}) },
  };
}

const NOW = Date.parse("2026-11-18T10:00:00.000Z");

test("the inventory reports every request state and job status", async () => {
  const inventory = await getAccountDeletionInventory({}, createDb(baseScenario()), NOW);

  assert.equal(inventory.requests.pending, 3);
  assert.equal(inventory.requests.completed, 0);
  assert.equal(inventory.jobs.blocked, 1);
  assert.equal(inventory.jobs.running, 0);
  assert.equal(inventory.oldest_pending_requested_at, "2026-11-18T08:00:00.000Z");
  assert.equal(inventory.oldest_pending_age_minutes, 120);
});

test("blocked jobs are surfaced with a bounded, safe row shape", async () => {
  const inventory = await getAccountDeletionInventory({}, createDb(baseScenario()), NOW);

  assert.equal(inventory.requiring_attention.length, 1);
  const job = inventory.requiring_attention[0];
  assert.deepEqual(Object.keys(job).sort(), [
    "age_minutes", "attempts", "error_code", "job_id", "next_attempt_at", "request_id", "status", "step_key", "updated_at",
  ]);
  assert.equal(job.attempts, 100);
  assert.equal(job.error_code, "storage_manifest_batch_remaining");
  assert.equal(job.age_minutes, 90);
});

test("the queries never ask for account content or credentials", async () => {
  const db = createDb(baseScenario());
  await getAccountDeletionInventory({}, db, NOW);

  // Only the two operational tables are touched: no users row, no email outbox, no
  // content table. Every read names its columns, so a future PII column cannot be
  // pulled in by a select("*").
  const tables = new Set(db.calls.map((call) => call.table));
  assert.deepEqual([...tables].sort(), ["account_deletion_jobs", "account_deletion_requests"]);
  for (const call of db.calls) {
    assert.equal(call.columns.includes("*"), false, `${call.table} must not select *`);
    if (call.head) assert.equal(call.columns, "id");
  }
  const forbidden = /(email|recipient|payload|token|access_|refresh_)/i;
  for (const call of db.calls) {
    assert.equal(forbidden.test(call.columns), false, `forbidden column in ${call.table}:${call.columns}`);
  }
});

test("an unreadable count fails instead of looking like an empty queue", async () => {
  const scenario = baseScenario();
  scenario.errors["account_deletion_jobs:blocked"] = { message: "permission denied" };
  await assert.rejects(
    () => getAccountDeletionInventory({}, createDb(scenario), NOW),
    (error) => error.message === "permission denied"
  );
});

test("a null or malformed count is refused, not reported as zero", async () => {
  for (const value of [null, -1, 1.5, "3", undefined]) {
    const scenario = baseScenario({ counts: { "account_deletion_requests:pending": value } });
    await assert.rejects(
      () => getAccountDeletionInventory({}, createDb(scenario), NOW),
      (error) => error.code === "invalid_deletion_inventory_count",
      `count ${String(value)} must be refused`
    );
  }
});

test("a malformed job list is refused instead of truncated to nothing", async () => {
  const scenario = baseScenario();
  scenario.lists["account_deletion_jobs:blocked,retry_wait,running"] = { rows: [] };
  await assert.rejects(
    () => getAccountDeletionInventory({}, createDb(scenario), NOW),
    (error) => /not an array/.test(error.message)
  );
});

test("an unsafe error code is dropped rather than echoed", async () => {
  const scenario = baseScenario();
  scenario.lists["account_deletion_jobs:blocked,retry_wait,running"] = [{
    id: "8f2c1c8e-4a52-4a1f-9d43-1f0e4c3b7a11",
    request_id: REQUEST_ID,
    step_key: "erase_content",
    status: "blocked",
    attempts: 100,
    safe_error_code: "Bearer eyJhbGciOiJIUzI1NiJ9.secret",
    updated_at: "2026-11-18T09:00:00.000Z",
  }];
  const inventory = await getAccountDeletionInventory({}, createDb(scenario), NOW);
  assert.equal(inventory.requiring_attention[0].error_code, null);
});

test("an empty queue reports zeros and no oldest request", async () => {
  const counts = {};
  for (const state of REQUEST_STATES) counts[`account_deletion_requests:${state}`] = 0;
  for (const status of JOB_STATUSES) counts[`account_deletion_jobs:${status}`] = 0;
  const inventory = await getAccountDeletionInventory(
    {},
    createDb({ counts, lists: {} }),
    NOW
  );

  assert.equal(inventory.requests.pending, 0);
  assert.equal(inventory.oldest_pending_requested_at, null);
  assert.equal(inventory.oldest_pending_age_minutes, null);
  assert.deepEqual(inventory.requiring_attention, []);
});

test("the limit is bounded and rejects nonsense", () => {
  assert.equal(parseLimit(undefined), 20);
  assert.equal(parseLimit("1"), 1);
  assert.equal(parseLimit("100"), 100);
  for (const value of ["0", "101", "-5", "2.5", "abc"]) {
    assert.throws(() => parseLimit(value), (error) => error.httpStatus === 422, `limit ${value}`);
  }
});


test("null successful list responses fail closed instead of appearing empty", async () => {
  const oldestScenario = baseScenario();
  oldestScenario.lists["account_deletion_requests:pending"] = null;
  await assert.rejects(
    () => getAccountDeletionInventory({}, createDb(oldestScenario), NOW),
    (error) => /oldest request response is not an array/.test(error.message)
  );

  const jobsScenario = baseScenario();
  jobsScenario.lists["account_deletion_jobs:blocked,retry_wait,running"] = null;
  await assert.rejects(
    () => getAccountDeletionInventory({}, createDb(jobsScenario), NOW),
    (error) => /job response is not an array/.test(error.message)
  );
});
