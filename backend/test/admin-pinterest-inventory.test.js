const test = require("node:test");
const assert = require("node:assert/strict");

const supabasePath = require.resolve("../supabase");
const modulePath = require.resolve("../adminPinterestInventory");
const calls = [];
let scheduleRows = [];
let attemptRows = [];

function query(table) {
  const state = { table, filters: [], selected: null, range: null };
  const builder = {
    select(columns) { state.selected = columns; return builder; },
    in(column, values) { state.filters.push(["in", column, values]); return builder; },
    order(column, options) { state.filters.push(["order", column, options]); return builder; },
    range(start, end) { state.range = [start, end]; return builder; },
    then(resolve, reject) {
      calls.push(state);
      const result = table === "pin_schedules" ? scheduleRows : attemptRows;
      return Promise.resolve({ data: result, error: null }).then(resolve, reject);
    },
  };
  return builder;
}

const supabaseMock = { from: query };
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseMock,
};
delete require.cache[modulePath];
const inventory = require("../adminPinterestInventory");

const NOW = Date.parse("2026-11-08T12:00:00.000Z");
function reset() {
  calls.length = 0;
  scheduleRows = [{
    id: "schedule-1", user_id: "user-1", pin_id: "pin-1",
    pinterest_account_id: "account-1", pinterest_board_id: "board-1",
    pinterest_pin_id: null, status: "unknown",
    scheduled_at: "2026-11-08T10:00:00.000Z", published_at: null,
    updated_at: "2026-11-08T11:00:00.000Z", attempts: 1,
    next_attempt_at: null, last_error: "outcome unknown",
    claim_token: null, snapshot_title: "must not leak",
  }];
  attemptRows = [{
    id: "attempt-1", user_id: "user-1", pin_id: "pin-1",
    pinterest_account_id: "account-1", pinterest_board_id: "board-1",
    pinterest_pin_id: null, status: "unknown", retry_safe: false,
    attempt_count: 1, updated_at: "2026-11-08T11:00:00.000Z",
    last_error: "remote outcome unknown",
  }];
}

test("inventory is bounded, read-only and exposes only allowlisted operational fields", async () => {
  reset();
  const result = await inventory.listPinterestSchedules({ limit: "10", offset: "0" }, NOW);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.table), ["pin_schedules", "pinterest_publish_attempts"]);
  assert.deepEqual(calls[0].range, [0, 9]);
  assert.equal(result.read_only, true);
  assert.equal(result.items[0].category, "unknown");
  assert.equal(result.items[0].actionable_reconciliation, true);
  assert.equal(result.items[0].attempt.retry_safe, false);
  assert.equal("claim_token" in result.items[0], false);
  assert.equal("snapshot_title" in result.items[0], false);
  assert.equal("id" in result.items[0].attempt, false);
});

test("attempt matching is scoped by both pin and Pinterest account", async () => {
  reset();
  attemptRows.push({
    ...attemptRows[0], id: "attempt-other-account",
    pinterest_account_id: "account-2", status: "failed", retry_safe: true,
  });
  const result = await inventory.listPinterestSchedules({}, NOW);
  assert.equal(result.items[0].attempt.status, "unknown");
  assert.equal(result.items[0].actionable_reconciliation, true);
});

test("stale publishing and overdue scheduled rows are classified without changing state", async () => {
  reset();
  scheduleRows = [
    { ...scheduleRows[0], id: "stale", status: "publishing", updated_at: "2026-11-08T11:00:00.000Z" },
    { ...scheduleRows[0], id: "due", status: "scheduled", scheduled_at: "2026-11-08T10:00:00.000Z" },
  ];
  attemptRows = [];
  const result = await inventory.listPinterestSchedules({}, NOW);
  assert.deepEqual(result.items.map((item) => item.category), ["stale_publishing", "overdue_scheduled"]);
  assert.equal(result.items.some((item) => item.actionable_reconciliation), false);
  assert.equal(calls.some((call) => call.range !== null), true);
});

test("invalid status and unbounded pagination inputs are rejected", async () => {
  reset();
  assert.throws(() => inventory.parseFilters({ status: "unknown,deleted" }), { httpStatus: 422 });
  assert.throws(() => inventory.parseFilters({ limit: "1000" }), { httpStatus: 422 });
  assert.throws(() => inventory.parseFilters({ offset: "-1" }), { httpStatus: 422 });
  assert.equal(calls.length, 0);
});

test("empty schedule page does not query attempt journal", async () => {
  reset();
  scheduleRows = [];
  const result = await inventory.listPinterestSchedules({}, NOW);
  assert.equal(result.count, 0);
  assert.equal(calls.length, 1);
});
