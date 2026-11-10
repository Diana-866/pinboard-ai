const test = require("node:test");
const assert = require("node:assert/strict");

let nextResult = { data: { id: "payment-1" }, error: null };
let calls = [];

const supabasePath = require.resolve("../supabase");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    from(table) {
      const state = { table, values: null, filters: {} };
      const builder = {
        update(values) { state.values = values; return builder; },
        eq(column, value) { state.filters[column] = value; return builder; },
        select(columns) { state.columns = columns; return builder; },
        maybeSingle() {
          calls.push(state);
          return Promise.resolve(nextResult);
        },
      };
      return builder;
    },
  },
};

const { denyUnsentPaymentRecord } = require("../paymentCreationIdempotency");

test("confirms a pending subscription is denied before provider submission", async () => {
  calls = [];
  nextResult = { data: { id: "payment-1" }, error: null };

  assert.equal(await denyUnsentPaymentRecord("subscriptions", "payment-1"), true);
  assert.deepEqual(calls[0], {
    table: "subscriptions",
    values: { status: "denied" },
    filters: { id: "payment-1", status: "pending" },
    columns: "id",
  });
});

test("confirms a pending credit purchase is denied before provider submission", async () => {
  calls = [];
  nextResult = { data: { id: "payment-2" }, error: null };

  assert.equal(await denyUnsentPaymentRecord("credit_purchases", "payment-2"), true);
  assert.equal(calls[0].table, "credit_purchases");
  assert.equal(calls[0].filters.status, "pending");
});

test("does not report cleanup success when the database update fails", async () => {
  nextResult = { data: null, error: { message: "database unavailable" } };
  await assert.rejects(
    denyUnsentPaymentRecord("subscriptions", "payment-1"),
    /database unavailable/
  );
});

test("does not report cleanup success when no pending row was updated", async () => {
  nextResult = { data: null, error: null };
  await assert.rejects(
    denyUnsentPaymentRecord("credit_purchases", "payment-2"),
    /not confirmed as denied/
  );
});

test("rejects unsupported tables and missing record IDs", async () => {
  await assert.rejects(denyUnsentPaymentRecord("users", "payment-1"), /invalid unsent payment/);
  await assert.rejects(denyUnsentPaymentRecord("subscriptions", ""), /invalid unsent payment/);
});
