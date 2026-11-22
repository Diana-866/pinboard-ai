const test = require("node:test");
const assert = require("node:assert/strict");

const supabasePath = require.resolve("../supabase");
const modulePath = require.resolve("../adminFinancialOperations");
const oldTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
let malformedRead = null;
const queryCounts = new Map();

const fixtures = {
  pin_generation_requests: [
    { id: 11, user_id: "private-user-1", idempotency_key: "private-generation-key", status: "processing", error_code: null, created_at: oldTimestamp, updated_at: oldTimestamp },
  ],
  pin_regeneration_requests: [
    { id: 21, user_id: "private-user-2", idempotency_key: "private-regeneration-key", status: "processing", provider_status: "failed", provider_refunded: null, provider_reconciled_at: null, created_at: oldTimestamp, updated_at: oldTimestamp },
  ],
  pin_generation_credit_reservations: [
    { id: 31, user_id: "private-user-1", idempotency_key: "private-generation-key", amount: 40, status: "reserved", created_at: oldTimestamp, updated_at: oldTimestamp },
    { id: 32, user_id: "orphan-user", idempotency_key: "private-orphan-key", amount: 15, status: "reserved", created_at: oldTimestamp, updated_at: oldTimestamp },
  ],
  pin_generation_tasks: [
    { generation_request_id: 11, status: "failed", provider_outcome_status: "failed", provider_refunded: false, provider_reconciled_at: oldTimestamp },
  ],
};

const supabaseMock = {
  from(table) {
    const queryNumber = (queryCounts.get(table) || 0) + 1;
    queryCounts.set(table, queryNumber);
    const query = {
      select() { return this; },
      eq() { return this; },
      lt() { return this; },
      order() { return this; },
      limit(value) { this.limitValue = value; return this; },
      in(column, values) {
        this.filterColumn = column;
        this.filterValues = values;
        return this;
      },
      then(resolve, reject) {
        if (malformedRead && malformedRead.table === table && malformedRead.call === queryNumber) {
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        let data = fixtures[table] || [];
        if (this.filterColumn) data = data.filter((row) => this.filterValues.includes(row[this.filterColumn]));
        if (Number.isFinite(this.limitValue)) data = data.slice(0, this.limitValue);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
};

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseMock,
};
delete require.cache[modulePath];
const { getFinancialOperationsQueue, summarizeGenerationTasks, clampInteger } = require("../adminFinancialOperations");

test("read-only queue classifies unresolved provider outcomes and stale reservations", async () => {
  const result = await getFinancialOperationsQueue({ olderThanMinutes: 30, limit: 50 });

  assert.equal(result.read_only, true);
  assert.equal(result.generation[0].reason, "reconciled_failure_awaiting_finalization");
  assert.equal(result.regeneration[0].reason, "provider_refund_fact_unresolved");
  assert.equal(result.reservations[0].reason, "old_active_reservation_requires_request_review");
  assert.equal(result.reservations[1].reason, "reservation_without_matching_request_review");
  assert.equal(result.reservations[0].operation, "generation");
  assert.equal(result.reservations[1].operation, "unmatched");

  const serialized = JSON.stringify(result);
  for (const secret of ["private-user", "private-generation-key", "private-regeneration-key", "private-orphan-key"]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(serialized.includes("provider_task_id"), false);
  assert.equal(serialized.includes("claim_token"), false);
});

test("task summary does not infer a refund when the provider refund fact is absent", () => {
  const summary = summarizeGenerationTasks([
    { status: "failed", provider_outcome_status: "failed", provider_refunded: null, provider_reconciled_at: null },
  ]);
  assert.equal(summary.reason, "provider_refund_fact_unresolved");
});

test("query parameter clamps are bounded and deterministic", () => {
  assert.equal(clampInteger("999999", 50, 1, 100), 100);
  assert.equal(clampInteger("-10", 50, 1, 100), 1);
  assert.equal(clampInteger("not-a-number", 50, 1, 100), 50);
});

/**
 * Section 127. The task journal is read in batches under a REST row cap. A full batch means the view is
 * incomplete, and an incomplete view whose visible tasks all look reconciled reads as "ready to
 * finalize" - the worst direction for an operator deciding about a refund.
 */
const { TASKS_TRUNCATED_REASON, TASK_FETCH_LIMIT } = require("../adminFinancialOperations");

function loadQueueWithTasks(taskRows, limit = 10) {
  const modulePathFresh = require.resolve("../adminFinancialOperations");
  const supabaseFresh = require.resolve("../supabase");
  const previousSupabase = require.cache[supabaseFresh];
  const previousModule = require.cache[modulePathFresh];
  require.cache[supabaseFresh] = {
    id: supabaseFresh,
    filename: supabaseFresh,
    loaded: true,
    exports: {
      from(table) {
        const query = {
          select() { return this; },
          eq() { return this; },
          lt() { return this; },
          order() { return this; },
          limit(value) { this.limitValue = value; return this; },
          in(column, values) { this.filterColumn = column; this.filterValues = values; return this; },
          then(resolve, reject) {
            let data = fixtures[table] || [];
            if (table === "pin_generation_tasks") data = taskRows;
            if (this.filterColumn) data = data.filter((row) => this.filterValues.includes(row[this.filterColumn]));
            if (Number.isFinite(this.limitValue)) data = data.slice(0, this.limitValue);
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        return query;
      },
    },
  };
  delete require.cache[modulePathFresh];
  try {
    return require("../adminFinancialOperations").getFinancialOperationsQueue({ limit });
  } finally {
    require.cache[supabaseFresh] = previousSupabase;
    if (previousModule) require.cache[modulePathFresh] = previousModule;
  }
}

test("a capped task batch never claims the request is ready to finalize", async () => {
  const resolved = { status: "failed", provider_outcome_status: "failed", provider_refunded: true, provider_reconciled_at: oldTimestamp };
  const capped = Array.from({ length: TASK_FETCH_LIMIT }, () => ({ generation_request_id: 11, ...resolved }));
  const result = await loadQueueWithTasks(capped);
  assert.equal(result.truncated.tasks, true, "a full batch is the row cap, not the end of the journal");
  assert.equal(result.generation[0].reason, TASKS_TRUNCATED_REASON);
  assert.notEqual(result.generation[0].reason, "reconciled_failure_awaiting_finalization");
});

test("a complete task batch keeps the derived reason", async () => {
  const resolved = { generation_request_id: 11, status: "failed", provider_outcome_status: "failed", provider_refunded: true, provider_reconciled_at: oldTimestamp };
  const result = await loadQueueWithTasks([resolved]);
  assert.equal(result.truncated.tasks, false);
  assert.equal(result.generation[0].reason, "reconciled_failure_awaiting_finalization");
});

test("truncation outranks every derived reason", () => {
  const tasks = [{ status: "failed", provider_outcome_status: "failed", provider_refunded: null, provider_reconciled_at: null }];
  assert.equal(summarizeGenerationTasks(tasks, { truncated: true }).reason, TASKS_TRUNCATED_REASON);
  assert.equal(summarizeGenerationTasks([], { truncated: true }).reason, TASKS_TRUNCATED_REASON);
  assert.equal(summarizeGenerationTasks([], {}).reason, "task_journal_missing_or_legacy");
});

test("financial reconciliation refuses malformed primary, task and matching-request query envelopes", async () => {
  const scenarios = [
    { table: "pin_generation_requests", call: 1 },
    { table: "pin_regeneration_requests", call: 1 },
    { table: "pin_generation_credit_reservations", call: 1 },
    { table: "pin_generation_tasks", call: 1 },
    { table: "pin_generation_requests", call: 2 },
    { table: "pin_regeneration_requests", call: 2 },
  ];
  for (const scenario of scenarios) {
    malformedRead = scenario;
    queryCounts.clear();
    await assert.rejects(
      getFinancialOperationsQueue({ limit: 10 }),
      (error) => error.httpStatus === 502
    );
  }
  malformedRead = null;
  queryCounts.clear();
});

test("reservation queue reports truncation based on the fetched rows before slicing", async () => {
  const result = await getFinancialOperationsQueue({ limit: 1 });
  assert.equal(result.reservations.length, 1, "the response stays within the requested category limit");
  assert.equal(result.counts.reservations, 1);
  assert.equal(result.truncated.reservations, true, "the extra fetched row proves the queue is truncated");
});

test("task truncation is scoped to the capped batch, not unrelated generation requests", async () => {
  const original = fixtures.pin_generation_requests.slice();
  try {
    for (let id = 12; id <= 61; id += 1) {
      fixtures.pin_generation_requests.push({ id, user_id: `user-${id}`, idempotency_key: `key-${id}`, status: "processing", created_at: oldTimestamp, updated_at: oldTimestamp });
    }
    const resolved = { status: "failed", provider_outcome_status: "failed", provider_refunded: true, provider_reconciled_at: oldTimestamp };
    const rows = Array.from({ length: TASK_FETCH_LIMIT }, () => ({ generation_request_id: 11, ...resolved }));
    rows.push({ generation_request_id: 61, ...resolved });
    const result = await loadQueueWithTasks(rows, 100);
    assert.equal(result.truncated.tasks, true, "the queue reports that at least one batch hit the cap");
    assert.equal(result.generation[0].reason, TASKS_TRUNCATED_REASON);
    assert.equal(result.generation[50].request_id, "61");
    assert.equal(result.generation[50].reason, "reconciled_failure_awaiting_finalization");
  } finally {
    fixtures.pin_generation_requests.splice(0, fixtures.pin_generation_requests.length, ...original);
  }
});


test("reservation matching fails closed when a REST-capped lookup could hide duplicate requests", async () => {
  const original = fixtures.pin_generation_requests.slice();
  try {
    for (let index = 0; index < 999; index += 1) {
      fixtures.pin_generation_requests.push({
        id: 1000 + index,
        user_id: "private-user-1",
        idempotency_key: "private-generation-key",
        status: "processing",
        created_at: oldTimestamp,
        updated_at: oldTimestamp,
      });
    }
    await assert.rejects(
      getFinancialOperationsQueue({ limit: 1 }),
      (error) => error.httpStatus === 502
    );
  } finally {
    fixtures.pin_generation_requests.splice(0, fixtures.pin_generation_requests.length, ...original);
  }
});
