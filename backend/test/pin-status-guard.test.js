const test = require("node:test");
const assert = require("node:assert/strict");
const { assertPinCanBeRejected, BLOCKING_SCHEDULE_STATUSES } = require("../pinStatusGuard");

function createSupabase(results) {
  const calls = [];
  return {
    calls,
    from(table) {
      const query = {
        table,
        select(columns) { this.columns = columns; return this; },
        eq(column, value) { (this.filters ||= []).push(["eq", column, value]); return this; },
        in(column, values) { (this.filters ||= []).push(["in", column, values]); return this; },
        limit(value) { this.limitValue = value; return this; },
        then(resolve, reject) {
          calls.push({ table: this.table, columns: this.columns, filters: this.filters, limit: this.limitValue });
          return Promise.resolve(results[this.table] || { data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test("allows rejection only when schedule and publication history are empty", async () => {
  const supabase = createSupabase({});
  await assert.doesNotReject(() => assertPinCanBeRejected(supabase, 42, "pin-1"));
  assert.deepEqual(supabase.calls.map((call) => call.table).sort(), [
    "pin_schedules", "pinterest_publications", "pinterest_publish_attempts",
  ]);
  for (const call of supabase.calls) {
    assert.deepEqual(call.filters.slice(0, 2), [
      ["eq", "user_id", "42"],
      ["eq", "pin_id", "pin-1"],
    ]);
    assert.equal(call.limit, 1);
  }
});

test("blocks pins with active, published or ambiguous schedules", async () => {
  assert.deepEqual(BLOCKING_SCHEDULE_STATUSES, ["scheduled", "publishing", "published", "unknown"]);
  for (const status of BLOCKING_SCHEDULE_STATUSES) {
    const supabase = createSupabase({
      pin_schedules: { data: [{ id: "schedule-1", status }], error: null },
    });
    await assert.rejects(
      () => assertPinCanBeRejected(supabase, "user-1", "pin-1"),
      { httpStatus: 409 },
    );
  }
});

test("blocks pins with any publication attempt or publication record", async () => {
  for (const table of ["pinterest_publish_attempts", "pinterest_publications"]) {
    const supabase = createSupabase({
      [table]: { data: [{ pin_id: "pin-1" }], error: null },
    });
    await assert.rejects(
      () => assertPinCanBeRejected(supabase, "user-1", "pin-1"),
      { httpStatus: 409 },
    );
  }
});

test("fails closed when publication history cannot be checked", async () => {
  const supabase = createSupabase({
    pinterest_publications: { data: null, error: new Error("database unavailable") },
  });
  await assert.rejects(
    () => assertPinCanBeRejected(supabase, "user-1", "pin-1"),
    /database unavailable/,
  );
});
