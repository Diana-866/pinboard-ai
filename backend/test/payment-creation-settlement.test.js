const test = require("node:test");
const assert = require("node:assert/strict");

const calls = [];
let nextResult = { data: true, error: null };
const supabasePath = require.resolve("../supabase");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve(nextResult);
    },
  },
};

const { settlePaymentCreationRequest, beginPaymentCreation } = require("../paymentCreationIdempotency");

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
