const test = require("node:test");
const assert = require("node:assert/strict");

const supabasePath = require.resolve("../supabase");
const modulePath = require.resolve("../adminPinterestInventory");
const calls = [];
let rows = [];
let rpcError = null;

const supabaseMock = {
  rpc(name, args) {
    calls.push({ name, args });
    return Promise.resolve({ data: rows, error: rpcError });
  },
};
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseMock,
};
delete require.cache[modulePath];
const inventory = require("../adminPinterestInventory");

const NOW = Date.parse("2026-11-08T12:00:00.000Z");
const ADMIN_ID = "a1b2c3d4-e5f6-47a8-9b0c-123456789abc";

function reset() {
  calls.length = 0;
  rpcError = null;
  rows = [{
    id: "schedule-1", user_id: "user-1", pin_id: "pin-1",
    pinterest_account_id: "account-1", pinterest_board_id: "board-1",
    pinterest_account: { username: "pinposy_test", pinterest_user_id: "remote-user-1", connected: true },
    pinterest_pin_id: null, status: "unknown",
    scheduled_at: "2026-11-08T10:00:00.000Z", published_at: null,
    updated_at: "2026-11-08T11:00:00.000Z", attempts: 1,
    next_attempt_at: null, last_error: "outcome unknown",
    claim_token: null, snapshot_title: "private database column",
    creative_title: "A scheduled Pinterest creative",
    creative_description: "The immutable description captured when scheduling.",
    attempt: {
      status: "unknown", retry_safe: false, attempt_count: 1,
      updated_at: "2026-11-08T11:00:00.000Z",
      last_error: "remote outcome unknown", pinterest_pin_id: null,
      pinterest_board_id: "board-1", id: "must not leak",
    },
  }];
}

test("inventory uses one bounded database RPC and exposes only allowlisted operational fields", async () => {
  reset();
  const result = await inventory.listPinterestSchedules({ limit: "10", offset: "0" }, NOW, ADMIN_ID);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "admin_list_pinterest_schedule_inventory");
  assert.deepEqual(calls[0].args, {
    p_operator_user_id: ADMIN_ID,
    p_statuses: ["scheduled", "publishing", "unknown"],
    p_limit: 10,
    p_offset: 0,
  });
  assert.equal(result.read_only, true);
  assert.equal(result.items[0].category, "unknown");
  assert.equal(result.items[0].actionable_reconciliation, true);
  assert.equal(result.items[0].attempt.retry_safe, false);
  assert.deepEqual(result.items[0].pinterest_account, { username: "pinposy_test", pinterest_user_id: "remote-user-1", connected: true });
  assert.equal("claim_token" in result.items[0], false);
  assert.equal(result.items[0].creative_title, "A scheduled Pinterest creative");
  assert.equal(result.items[0].creative_description, "The immutable description captured when scheduling.");
  assert.equal("snapshot_title" in result.items[0], false);
  assert.equal("creative_image_url" in result.items[0], false);
  assert.equal("id" in result.items[0].attempt, false);
  assert.equal("user_id" in result.items[0], false);
});

test("creative context is bounded before it reaches the admin UI", async () => {
  reset();
  rows[0].creative_title = "T".repeat(300);
  rows[0].creative_description = "D".repeat(700);
  const result = await inventory.listPinterestSchedules({}, NOW, ADMIN_ID);
  assert.equal(result.items[0].creative_title.length, 200);
  assert.equal(result.items[0].creative_description.length, 500);
});

test("attempt is already scoped to the schedule identity by the database query", async () => {
  reset();
  rows[0].attempt = {
    status: "failed", retry_safe: true, attempt_count: 2,
    updated_at: "2026-11-08T11:59:00.000Z",
    last_error: "previous account attempt", pinterest_pin_id: null,
    pinterest_board_id: "board-1",
  };
  const result = await inventory.listPinterestSchedules({}, NOW, ADMIN_ID);
  assert.equal(result.items[0].attempt.status, "failed");
  assert.equal(result.items[0].actionable_reconciliation, false);
});

test("operational errors redact credential-like values", async () => {
  reset();
  rows[0].last_error =
    "Authorization: Bearer secret-value eyJabcdefghij.klmnopqrst.uvwxyzABCD access_token=private-value";
  const result = await inventory.listPinterestSchedules({}, NOW, ADMIN_ID);
  assert.equal(
    result.items[0].last_error,
    "Authorization: Bearer [redacted] [redacted-token] access_token=[redacted]",
  );
});

test("stale publishing and overdue scheduled rows are classified without changing state", async () => {
  reset();
  rows = [
    { ...rows[0], id: "stale", status: "publishing", updated_at: "2026-11-08T11:00:00.000Z" },
    { ...rows[0], id: "due", status: "scheduled", scheduled_at: "2026-11-08T10:00:00.000Z" },
  ];
  const result = await inventory.listPinterestSchedules({}, NOW, ADMIN_ID);
  assert.deepEqual(result.items.map((item) => item.category), ["stale_publishing", "overdue_scheduled"]);
  assert.equal(result.items.some((item) => item.actionable_reconciliation), false);
});

test("invalid status, pagination and operator identity are rejected before database access", async () => {
  reset();
  assert.throws(() => inventory.parseFilters({ status: "unknown,deleted" }), { httpStatus: 422 });
  assert.throws(() => inventory.parseFilters({ limit: "1000" }), { httpStatus: 422 });
  assert.throws(() => inventory.parseFilters({ offset: "-1" }), { httpStatus: 422 });
  await assert.rejects(inventory.listPinterestSchedules({}, NOW), { httpStatus: 401 });
  await assert.rejects(inventory.listPinterestSchedules({}, NOW, "not-a-uuid"), { httpStatus: 401 });
  assert.equal(calls.length, 0);
});

test("database rechecks administrator status and a denied operator receives 403", async () => {
  reset();
  rpcError = { message: "administrator privileges required" };
  await assert.rejects(
    inventory.listPinterestSchedules({}, NOW, ADMIN_ID),
    { httpStatus: 403 },
  );
  assert.equal(calls.length, 1);
});

test("empty page is returned without a second unbounded journal query", async () => {
  reset();
  rows = [];
  const result = await inventory.listPinterestSchedules({}, NOW, ADMIN_ID);
  assert.equal(result.count, 0);
  assert.equal(calls.length, 1);
});
