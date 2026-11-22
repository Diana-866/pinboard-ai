const test = require("node:test");
const assert = require("node:assert/strict");

const supabasePath = require.resolve("../supabase");
const modulePath = require.resolve("../adminPaymentCreationRequests");
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true, exports: {},
};
delete require.cache[modulePath];
const { listPaymentCreationRequests, parseLimit, safeErrorCode } = require("../adminPaymentCreationRequests");

const calls = [];
let rows = [];
let relatedRows = { subscriptions: [], credit_purchases: [] };
let queryErrors = {};
let malformedResults = {};
const db = {
  from(table) {
    const call = { table };
    calls.push(call);
    const query = {
      select(columns) { call.columns = columns; return this; },
      in(column, values) { call.filter = { column, values }; return this; },
      order(column, options) { call.order = { column, options }; return this; },
      limit(value) { call.limit = value; return this; },
      then(resolve, reject) {
        let data = Object.hasOwn(malformedResults, table)
          ? malformedResults[table]
          : (table === "payment_creation_requests" ? rows : (relatedRows[table] || []));
        if (Number.isFinite(call.limit)) data = data.slice(0, call.limit);
        return Promise.resolve({ data, error: queryErrors[table] || null }).then(resolve, reject);
      },
    };
    return query;
  },
};

function reset() {
  calls.length = 0;
  queryErrors = {};
  malformedResults = {};
  relatedRows = {
    subscriptions: [{
      id: "subscription-1", user_id: "user-1", provider_payment_id: "pp-test-order-0001",
      plan: "pro", status: "pending", amount: 4990, currency: "rub",
    }],
    credit_purchases: [],
  };
  rows = [
    {
      id: "request-unknown", provider_order_id: "pp-test-order-0001", user_id: "user-1", request_kind: "subscription",
      status: "unknown", error_code: "ECONNRESET",
      created_at: "2026-11-10T10:00:00.000Z", updated_at: "2026-11-10T10:01:00.000Z",
      idempotency_key: "must-not-leak", result: { payment_url: "https://secret.example/pay" },
    },
    {
      id: "request-creating", provider_order_id: null, user_id: "user-2", request_kind: "credits",
      status: "creating", error_code: null,
      created_at: "2026-11-10T09:55:00.000Z", updated_at: "2026-11-10T09:56:00.000Z",
    },
  ];
}

test("admin inventory is read-only, bounded and excludes checkout secrets", async () => {
  reset();
  const result = await listPaymentCreationRequests({ limit: "10" }, Date.parse("2026-11-10T10:00:00.000Z"), db);
  assert.deepEqual(calls[0], {
    table: "payment_creation_requests",
    columns: "id, provider_order_id, user_id, request_kind, status, error_code, created_at, updated_at",
    filter: { column: "status", values: ["unknown", "creating"] },
    order: { column: "updated_at", options: { ascending: true } },
    limit: 11,
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1].filter, { column: "provider_payment_id", values: ["pp-test-order-0001"] });
  assert.equal(result.read_only, true);
  assert.equal(result.automatic_reconciliation, false);
  assert.equal(result.unknown_count, 1);
  assert.equal(result.items[0].provider_order_id, "pp-test-order-0001");
  assert.equal(result.items[0].local_payment_match, "matched");
  assert.equal(result.items[0].local_payment_record_id, "subscription-1");
  assert.equal(result.items[0].product_id, "pro");
  assert.equal(Number(result.items[0].expected_amount), 4990);
  assert.equal(result.items[0].currency, "rub");
  assert.equal(result.creating_count, 1);
  assert.equal(result.stale_creation_count, 1);
  const serialized = JSON.stringify(result);
  for (const secret of ["must-not-leak", "https://secret.example/pay", '"result"', '"idempotency_key"']) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("flags provider orders whose local payment identity does not match the request", async () => {
  reset();
  relatedRows.subscriptions[0].user_id = "different-user";
  const result = await listPaymentCreationRequests({}, Date.parse("2026-11-10T10:03:00.000Z"), db);
  assert.equal(result.items[0].local_payment_match, "identity_mismatch");
  assert.equal(result.items[0].expected_amount, undefined);
});

test("reports missing local payment records rather than implying a match", async () => {
  reset();
  relatedRows.subscriptions = [];
  const result = await listPaymentCreationRequests({}, Date.now(), db);
  assert.equal(result.items[0].local_payment_match, "missing");
});

test("unsafe error codes are redacted and timestamps produce bounded ages", async () => {
  reset();
  rows[0].error_code = "Authorization: Bearer secret";
  const result = await listPaymentCreationRequests({}, Date.parse("2026-11-10T10:03:00.000Z"), db);
  assert.equal(result.items[0].error_code, null);
  assert.equal(result.items[0].age_minutes, 2);
  assert.equal(safeErrorCode("provider_timeout-1"), "provider_timeout-1");
});

test("invalid limits are rejected before database access", async () => {
  reset();
  for (const value of ["0", "-1", "101", "1.5", "nope"]) {
    assert.throws(() => parseLimit(value), { httpStatus: 422 });
  }
  await assert.rejects(listPaymentCreationRequests({ limit: "101" }, Date.now(), db), { httpStatus: 422 });
  assert.equal(calls.length, 0);
});

test("database errors are propagated without inventing an empty queue", async () => {
  reset();
  queryErrors.payment_creation_requests = { message: "database unavailable" };
  await assert.rejects(listPaymentCreationRequests({}, Date.now(), db), /database unavailable/);
});

test("payment detail query errors are propagated", async () => {
  reset();
  queryErrors.subscriptions = { message: "subscription lookup failed" };
  await assert.rejects(listPaymentCreationRequests({}, Date.now(), db), /subscription lookup failed/);
});

test("one provider order linked to two local payment records is an error, not a choice", async () => {
  reset();
  // The same order id existing as both a subscription and a credit purchase means the local ledger is
  // ambiguous; picking one would show an operator a match that may be the wrong payment.
  relatedRows.credit_purchases = [{
    id: "purchase-1", user_id: "user-1", provider_payment_id: "pp-test-order-0001",
    package_id: "pack_50", status: "pending", amount: 190, currency: "rub",
  }];
  await assert.rejects(
    listPaymentCreationRequests({}, Date.now(), db),
    /linked to multiple local payment records/
  );
});

test("a payment of the wrong kind is a mismatch even for the same user", async () => {
  reset();
  // The request is a subscription; the only local record with that order id is a credit purchase.
  relatedRows.subscriptions = [];
  relatedRows.credit_purchases = [{
    id: "purchase-1", user_id: "user-1", provider_payment_id: "pp-test-order-0001",
    package_id: "pack_50", status: "pending", amount: 190, currency: "rub",
  }];
  const result = await listPaymentCreationRequests({}, Date.now(), db);
  assert.equal(result.items[0].local_payment_match, "identity_mismatch");
  assert.equal(result.items[0].expected_amount, undefined, "a mismatch must not expose the other record's amount");
  assert.equal(result.items[0].local_payment_record_id, undefined);
});

test("a matched payment is shown without the internal owner column", async () => {
  reset();
  const result = await listPaymentCreationRequests({}, Date.now(), db);
  const item = result.items[0];
  assert.equal(item.local_payment_match, "matched");
  assert.equal(item.local_payment_record_id, "subscription-1");
  assert.equal(item.local_payment_status, "pending");
  assert.equal(item.expected_amount, 4990);
  // Both join columns stay internal: the match signal is local_payment_match, and neither the owner
  // id nor the record kind is needed to act on the row.
  assert.equal(Object.hasOwn(item, "local_user_id"), false, "the join column must not reach the admin payload");
  assert.equal(Object.hasOwn(item, "matched_record_kind"), false);
});

test("malformed successful reconciliation query envelopes fail closed at every query stage", async () => {
  for (const table of ["payment_creation_requests", "subscriptions", "credit_purchases"]) {
    reset();
    malformedResults[table] = null;
    await assert.rejects(
      listPaymentCreationRequests({}, Date.now(), db),
      (error) => error.httpStatus === 502
    );
  }
});


test("duplicate local payment rows for one provider order fail closed within either payment kind", async () => {
  for (const kind of ["subscriptions", "credit_purchases"]) {
    reset();
    const source = kind === "subscriptions" ? relatedRows.subscriptions : relatedRows.credit_purchases;
    const row = kind === "subscriptions"
      ? { ...source[0], id: "subscription-duplicate", provider_payment_id: "pp-test-order-0001" }
      : {
          id: "purchase-duplicate", user_id: "user-1", provider_payment_id: "pp-test-order-0001",
          package_id: "pack_50", status: "pending", amount: 190, currency: "rub",
        };
    if (kind === "subscriptions") {
      relatedRows.subscriptions = [source[0], row];
    } else {
      relatedRows.credit_purchases = [row, { ...row, id: "purchase-duplicate-2" }];
    }
    await assert.rejects(
      listPaymentCreationRequests({}, Date.now(), db),
      /linked to multiple local payment records/
    );
  }
});


test("payment creation inventory reports a truncated queue without returning the extra row", async () => {
  reset();
  const result = await listPaymentCreationRequests({ limit: 1 }, Date.now(), db);
  assert.equal(calls[0].limit, 2, "fetch one extra row to detect truncation");
  assert.equal(result.count, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.truncated, true);
});


test("payment reconciliation fails closed when related lookup reaches its safety cap", async () => {
  for (const kind of ["subscriptions", "credit_purchases"]) {
    reset();
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      id: kind + "-" + index,
      user_id: "user-1",
      provider_payment_id: "pp-test-order-0001",
      ...(kind === "subscriptions" ? { plan: "pro" } : { package_id: "pack_50" }),
      status: "pending",
      amount: kind === "subscriptions" ? 4990 : 190,
      currency: "rub",
    }));
    relatedRows[kind] = rows;
    if (kind === "subscriptions") relatedRows.credit_purchases = [];
    else relatedRows.subscriptions = [];
    await assert.rejects(
      listPaymentCreationRequests({}, Date.now(), db),
      (error) => error.httpStatus === 502
    );
    assert.equal(calls.find((call) => call.table === kind).limit, 1001);
  }
});
