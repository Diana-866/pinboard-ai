const test = require("node:test");
const assert = require("node:assert/strict");

const calls = [];
let nextResult = { data: true, error: null };
let paymentRow = { id: "subscription-uuid", status: "pending" };
let cleanupFails = false;
let failingRpc = null;
const supabasePath = require.resolve("../supabase");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    rpc(name, args) {
      calls.push({ name, args });
      if (name === failingRpc) return Promise.resolve({ data: null, error: { message: "simulated RPC failure" } });
      return Promise.resolve(nextResult);
    },
    from(table) {
      assert.ok(["subscriptions", "credit_purchases"].includes(table));
      const filters = [];
      let updateValues;
      const query = {
        update(values) { updateValues = values; return this; },
        eq(column, value) { filters.push([column, value]); return this; },
        select() { return this; },
        async maybeSingle() {
          if (cleanupFails) return { data: null, error: { message: "cleanup database unavailable" } };
          const matches = filters.every(([column, value]) => paymentRow[column] === value);
          if (!matches) return { data: null, error: null };
          Object.assign(paymentRow, updateValues);
          return { data: { id: paymentRow.id }, error: null };
        },
      };
      return query;
    },
  },
};

const {
  settlePaymentCreationRequest,
  beginPaymentCreation,
  handlePaymentProviderFailure,
} = require("../paymentCreationIdempotency");

test("settles only the exact provider order, kind and local payment record", async () => {
  calls.length = 0;
  nextResult = { data: true, error: null };
  assert.equal(
    await settlePaymentCreationRequest("pp-order-00000001", "credits", "purchase-uuid"),
    true
  );
  assert.deepEqual(calls[0], {
    name: "settle_payment_creation_request",
    args: {
      p_order_id: "pp-order-00000001",
      p_request_kind: "credits",
      p_local_payment_id: "purchase-uuid",
    },
  });
});

test("treats legacy orders without an idempotency request as a no-op", async () => {
  nextResult = { data: false, error: null };
  assert.equal(
    await settlePaymentCreationRequest("pp-legacy-order-0001", "subscription", "subscription-uuid"),
    false
  );
});

test("propagates database settlement failures so webhook delivery can be retried", async () => {
  nextResult = { data: null, error: { message: "database unavailable" } };
  await assert.rejects(
    settlePaymentCreationRequest("pp-order-00000002", "subscription", "subscription-uuid"),
    /database unavailable/
  );
});

test("rejects incomplete or unsupported settlement identities before database access", async () => {
  const count = calls.length;
  await assert.rejects(settlePaymentCreationRequest("", "credits", "purchase-uuid"), /invalid settled payment/);
  await assert.rejects(settlePaymentCreationRequest("pp-order-00000003", "other", "purchase-uuid"), /invalid settled payment/);
  await assert.rejects(settlePaymentCreationRequest("pp-order-00000004", "credits", null), /invalid settled payment/);
  assert.equal(calls.length, count);
});

test("does not replay an already settled checkout as a new invoice", async () => {
  nextResult = { data: { status: "settled" }, error: null };
  await assert.rejects(
    beginPaymentCreation("user-1", "settled-checkout-key-001", "credits", "pack_100", "rub"),
    (error) => error.httpStatus === 409 && error.details?.code === "payment_already_settled"
  );
});


test("a definitive provider 4xx rejection closes the unsent order and releases the idempotency request", async () => {
  calls.length = 0;
  paymentRow = { id: "subscription-uuid", status: "pending" };
  cleanupFails = false;
  nextResult = { data: true, error: null };

  const outcome = await handlePaymentProviderFailure(
    "user-1",
    "provider-rejected-key-001",
    "subscriptions",
    "subscription-uuid",
    Object.assign(new Error("provider rejected checkout"), { providerRejected: true, code: "PROVIDER_422" })
  );

  assert.equal(outcome, "failed");
  assert.equal(paymentRow.status, "denied");
  assert.deepEqual(calls.map((call) => call.name), ["fail_payment_creation_request"]);
});

test("keeps the checkout fenced when the failure RPC returns false without a database error", async () => {
  calls.length = 0;
  paymentRow = { id: "subscription-uuid", status: "pending" };
  cleanupFails = false;
  failingRpc = null;
  nextResult = { data: false, error: null };

  const outcome = await handlePaymentProviderFailure(
    "user-1",
    "provider-release-false-key-001",
    "subscriptions",
    "subscription-uuid",
    Object.assign(new Error("provider rejected checkout"), { providerRejected: true })
  );

  assert.equal(outcome, "unknown");
  assert.equal(paymentRow.status, "denied");
  assert.deepEqual(calls.map((call) => call.name), [
    "fail_payment_creation_request",
    "mark_payment_creation_unknown",
  ]);
  nextResult = { data: true, error: null };
});

test("an ambiguous provider outcome remains fenced against duplicate invoice creation", async () => {
  calls.length = 0;
  paymentRow = { id: "subscription-uuid", status: "pending" };
  cleanupFails = false;
  nextResult = { data: true, error: null };

  const outcome = await handlePaymentProviderFailure(
    "user-1",
    "provider-timeout-key-001",
    "subscriptions",
    "subscription-uuid",
    new Error("socket timeout")
  );

  assert.equal(outcome, "unknown");
  assert.equal(paymentRow.status, "pending");
  assert.deepEqual(calls.map((call) => call.name), ["mark_payment_creation_unknown"]);
});

test("a failed cleanup after provider rejection remains unknown instead of allowing a duplicate invoice", async () => {
  calls.length = 0;
  paymentRow = { id: "subscription-uuid", status: "pending" };
  cleanupFails = true;
  nextResult = { data: true, error: null };

  const outcome = await handlePaymentProviderFailure(
    "user-1",
    "provider-cleanup-key-001",
    "subscriptions",
    "subscription-uuid",
    Object.assign(new Error("provider rejected checkout"), { providerRejected: true })
  );

  assert.equal(outcome, "unknown");
  assert.equal(paymentRow.status, "pending");
  assert.deepEqual(calls.map((call) => call.name), ["mark_payment_creation_unknown"]);
  cleanupFails = false;
});


test("does not release a retry when the idempotency failure RPC cannot be confirmed", async () => {
  calls.length = 0;
  paymentRow = { id: "subscription-uuid", status: "pending" };
  cleanupFails = false;
  failingRpc = "fail_payment_creation_request";
  nextResult = { data: true, error: null };

  const outcome = await handlePaymentProviderFailure(
    "user-1",
    "provider-release-failure-key",
    "subscriptions",
    "subscription-uuid",
    Object.assign(new Error("provider rejected checkout"), { providerRejected: true })
  );

  assert.equal(outcome, "unknown");
  assert.equal(paymentRow.status, "denied");
  assert.deepEqual(calls.map((call) => call.name), [
    "fail_payment_creation_request",
    "mark_payment_creation_unknown",
  ]);
  failingRpc = null;
});
