"use strict";

const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");
const path = require("node:path");

/**
 * The credit-pack webhook is where money becomes credits. Every branch decides either "give the
 * customer what they paid for" or "do not", and until now lines 183-380 of creditsBilling.js had no
 * executed test at all - 79.85% of the file, with the money path inside the missing part.
 *
 * The handler is driven through its real composition; only the provider, the receipt/audit/idempotency
 * modules and the database are doubled, because each of those has its own tests.
 */

const CREDITS_BILLING = path.join(__dirname, "..", "creditsBilling.js");
const PURCHASE = {
  id: "purchase-1",
  user_id: "buyer-1",
  amount: 190,
  credits: 50,
  currency: "rub",
  package_id: "pack_50",
  pack_title: "50 кредитов",
  status: "pending",
  balance_credited_at: null,
};

function freshCreditsBilling(options = {}) {
  const calls = { receipts: [], decisions: [], exceptions: [], settled: [], updates: [], rpcs: [] };
  const state = {
    purchase: options.purchase === undefined ? PURCHASE : options.purchase,
    lookupError: options.lookupError || null,
    updateError: options.updateError || null,
    verify: options.verify || { ok: true },
    // An empty string is a deliberate scenario ("the provider status is unrecognised"), so a
    // falsy default here would silently turn it back into success.
    normalizedStatus: options.normalizedStatus !== undefined ? options.normalizedStatus : "success",
    amount: options.amount || { ok: true, amount: 190 },
    demoBlocked: options.demoBlocked === true,
    receiptError: options.receiptError || null,
    rpcAnswer: options.rpcAnswer || { data: { decision: "granted", idempotent: false }, error: null },
    settleError: options.settleError || null,
    auditError: options.auditError || null,
    decisionError: options.decisionError || null,
  };

  const db = {
    from(table) {
      const filters = {};
      const builder = {
        select() { return builder; },
        eq(column, value) { filters[column] = value; return builder; },
        is(column, value) { filters[column] = value; return builder; },
        neq(column, value) { filters[column] = value; return builder; },
        update(payload) {
          calls.updates.push({ table, payload, filters });
          return builder;
        },
        then(resolve) {
          if (table === "credit_purchases" && calls.updates.length > 0) {
            return Promise.resolve({ data: null, error: state.updateError }).then(resolve);
          }
          return Promise.resolve({
            data: state.purchase,
            error: state.lookupError,
          }).then(resolve);
        },
        maybeSingle() {
          return Promise.resolve({ data: state.purchase, error: state.lookupError });
        },
      };
      return builder;
    },
    rpc(name, params) {
      calls.rpcs.push({ name, params });
      return Promise.resolve(state.rpcAnswer);
    },
  };

  const doubles = {
    "../prodamus": {
      verifyWebhook: () => state.verify,
      isDemoWebhookBlocked: () => state.demoBlocked,
      normalizePaymentStatus: () => state.normalizedStatus,
      getWebhookPaymentAmount: () => state.amount,
    },
    "../paymentProviderReceipts": {
      persistProviderReceipt: async (_db, args) => {
        calls.receipts.push(args);
        if (state.receiptError) throw state.receiptError;
        return { receiptId: "receipt-1" };
      },
      setProviderDecision: async (_db, args) => {
        calls.decisions.push(args);
        if (state.decisionError) throw state.decisionError;
        return { ok: true };
      },
    },
    "../billingWebhookAudit": {
      persistWebhookException: async (_db, args) => {
        calls.exceptions.push(args);
        if (state.auditError) throw state.auditError;
        return { ok: true };
      },
    },
    "../paymentCreationIdempotency": {
      settlePaymentCreationRequest: async (orderId, kind, id) => {
        calls.settled.push({ orderId, kind, id });
        if (state.settleError) throw state.settleError;
        return true;
      },
      beginPaymentCreation: async () => ({}),
      attachPaymentCreationOrder: async () => ({}),
      denyUnsentPaymentRecord: async () => ({}),
      completePaymentCreation: async () => ({}),
      markPaymentCreationUnknown: async () => ({}),
      failPaymentCreation: async () => ({}),
      handlePaymentProviderFailure: async () => ({}),
    },
  };

  delete require.cache[require.resolve(CREDITS_BILLING)];
  for (const [request, double] of Object.entries(doubles)) {
    const resolved = require.resolve(request);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: double };
  }
  const module = require(CREDITS_BILLING);
  return { module, db, calls, state };
}

function createResponse() {
  const response = {
    statusCode: 200,
    body: null,
    status(code) { response.statusCode = code; return response; },
    json(payload) { response.body = payload; return response; },
  };
  return response;
}

async function run(options = {}, body = {}, dependencies = {}) {
  const handle = freshCreditsBilling(options);
  const response = createResponse();
  await handle.module.handleCreditsWebhook(
    { body, headers: { "prodamus-sign": "sig" } },
    response,
    { supabase: handle.db, ...dependencies }
  );
  return { ...handle, response };
}

test("a forged signature is refused and nothing is recorded", async () => {
  const { response, calls } = await run({ verify: { ok: false, reason: "bad signature" } });
  assert.equal(response.statusCode, 403);
  assert.equal(calls.receipts.length, 0, "an unverified event must not be stored as a provider fact");
  assert.equal(calls.decisions.length, 0);
  assert.equal(calls.rpcs.length, 0);
});

test("the verified provider fact is stored before the order is looked up", async () => {
  const { response, calls } = await run({ lookupError: { message: "boom" } }, { order_id: "ppc-1", payment_status: "success" });
  assert.equal(response.statusCode, 500);
  assert.equal(calls.receipts.length, 1);
  assert.equal(calls.receipts[0].paymentKind, "credits");
  assert.equal(response.body.error, "db error");
});

test("if the receipt cannot be stored the handler stops before touching the order", async () => {
  const { response, calls } = await run({ receiptError: new Error("storage down") });
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "receipt storage failed");
  assert.equal(calls.rpcs.length, 0, "no entitlement work may happen without a durable provider fact");
});

test("a demo payment on a production deployment never credits", async () => {
  const { response, calls } = await run({ demoBlocked: true });
  assert.equal(response.statusCode, 503);
  assert.equal(calls.rpcs.length, 0);
});

test("an event without an order id is recorded as unmatched, not credited", async () => {
  const { response, calls } = await run({}, { payment_status: "success", sum: "190.00" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ignored, "no order_id");
  assert.equal(calls.exceptions.length, 1);
  assert.equal(calls.exceptions[0].reason, "missing_order_id");
  assert.equal(calls.decisions[0].decision, "unmatched");
  assert.equal(calls.rpcs.length, 0);
});

test("an order that does not exist is recorded for review and never credited", async () => {
  const { response, calls } = await run({ purchase: null }, { order_id: "ppc-unknown", payment_status: "success" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ignored, "unknown order_id");
  assert.equal(calls.exceptions[0].reason, "unknown_order_id");
  assert.equal(calls.decisions[0].reasonCode, "unknown_order_id");
  assert.equal(calls.rpcs.length, 0);
});

test("an unrecognised provider status goes to review instead of guessing", async () => {
  const { response, calls } = await run(
    { normalizedStatus: "" },
    { order_id: "ppc-1", payment_status: "provider-new-state", sum: "190.00" }
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.review_required, true);
  assert.equal(calls.exceptions[0].reason, "unsupported_payment_status");
  assert.equal(calls.decisions[0].decision, "pending_review");
  assert.equal(calls.rpcs.length, 0);
});

test("a non-success status is recorded and never overwrites an already credited purchase", async () => {
  const { response, calls } = await run(
    { normalizedStatus: "failed" },
    { order_id: "ppc-1", payment_status: "failed" }
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "failed");
  assert.equal(calls.decisions[0].decision, "ignored_non_success");
  const update = calls.updates.find((entry) => entry.table === "credit_purchases");
  assert.equal(update.payload.status, "failed");
  assert.equal(update.filters.balance_credited_at, null, "a failure must never clear a credited purchase");
  assert.equal(update.filters.status, "success", "the update must refuse to touch an already successful row");
  assert.equal(calls.rpcs.length, 0);
});

test("an unreadable amount is a mismatch for review, not a credit", async () => {
  const { response, calls } = await run(
    { amount: { ok: false, reason: "invalid_payment_amount" } },
    { order_id: "ppc-1", payment_status: "success" }
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ignored, "invalid_payment_amount");
  assert.equal(calls.decisions[0].decision, "rejected_mismatch");
  assert.equal(calls.rpcs.length, 0);
});

test("a paid amount that differs from the order is denied and never credited", async () => {
  const { response, calls } = await run(
    { amount: { ok: true, amount: 1 } },
    { order_id: "ppc-1", payment_status: "success" }
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ignored, "amount mismatch");
  assert.equal(calls.exceptions[0].reason, "amount_mismatch");
  const update = calls.updates.find((entry) => entry.table === "credit_purchases");
  assert.equal(update.payload.status, "denied");
  assert.equal(calls.rpcs.length, 0);
});

test("a matching payment credits exactly once through the transactional RPC", async () => {
  const { response, calls } = await run({}, { order_id: "ppc-1", payment_status: "success", sum: "190.00" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "success");
  assert.equal(response.body.credits, 50);
  assert.equal(response.body.idempotent, false);

  const rpc = calls.rpcs.find((entry) => entry.name === "credit_paid_purchase_with_receipt");
  assert.ok(rpc, "crediting must go through the single transactional RPC");
  assert.equal(rpc.params.p_purchase_id, PURCHASE.id);
  assert.equal(rpc.params.p_receipt_id, "receipt-1");
  assert.match(rpc.params.p_description, /50 кредитов/);
  assert.equal(calls.settled.length, 1, "the pending payment request must be settled after crediting");
  assert.equal(calls.settled[0].kind, "credits");
});

test("a replay is reported as idempotent, not as a second credit", async () => {
  const { response, calls } = await run(
    { rpcAnswer: { data: { decision: "granted", idempotent: true }, error: null } },
    { order_id: "ppc-1", payment_status: "success", sum: "190.00" }
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.idempotent, true);
  assert.equal(calls.rpcs.filter((entry) => entry.name === "credit_paid_purchase_with_receipt").length, 1);
});

test("a withheld fulfilment is reported as a decision, never as an error the provider should retry", async () => {
  for (const decision of ["withheld_account_lifecycle", "rejected_mismatch"]) {
    const { response } = await run(
      { rpcAnswer: { data: { decision }, error: null } },
      { order_id: "ppc-1", payment_status: "success", sum: "190.00" }
    );
    assert.equal(response.statusCode, 200, `${decision} must not look like a transient failure`);
    assert.equal(response.body.decision, decision);
    assert.equal(response.body.review_required, true);
  }
});

test("a fulfilment answer that is not a known decision is an error, not a silent success", async () => {
  const { response } = await run(
    { rpcAnswer: { data: { decision: "maybe" }, error: null } },
    { order_id: "ppc-1", payment_status: "success", sum: "190.00" }
  );
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "invalid fulfillment decision");
});

test("a fulfilment that fails on a lifecycle refusal records the decision before failing", async () => {
  const { response, calls } = await run(
    { rpcAnswer: { data: null, error: { message: "account lifecycle: user is not active" } } },
    { order_id: "ppc-1", payment_status: "success", sum: "190.00" }
  );
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "crediting failed");
  assert.equal(calls.decisions[0].decision, "withheld_account_lifecycle");
  assert.equal(calls.settled.length, 0);
});

test("a settlement failure keeps the event retryable instead of reporting success", async () => {
  const { response, calls } = await run(
    { settleError: new Error("reconciliation down") },
    { order_id: "ppc-1", payment_status: "success", sum: "190.00" }
  );
  assert.equal(response.statusCode, 500, "the provider must retry: credits exist but the request was not settled");
  assert.equal(response.body.error, "payment reconciliation failed");
  assert.equal(calls.rpcs.filter((entry) => entry.name === "credit_paid_purchase_with_receipt").length, 1);
});

test("an audit that cannot be written fails the event instead of crediting it", async () => {
  // The audit row is the only record that a mismatched payment happened. If it cannot be written,
  // continuing would either credit money nobody matched or lose the evidence.
  const { response, calls } = await run(
    { auditError: new Error("audit down"), amount: { ok: true, amount: 1 } },
    { order_id: "ppc-1", payment_status: "success" }
  );
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "audit storage failed");
  assert.equal(calls.rpcs.length, 0, "nothing may be credited when the mismatch was not recorded");
});

test("a decision that cannot be stored fails the event while it is still retryable", async () => {
  const { response, calls } = await run(
    { decisionError: new Error("decision down"), normalizedStatus: "failed" },
    { order_id: "ppc-1", payment_status: "failed" }
  );
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "decision storage failed");
  assert.equal(calls.rpcs.length, 0);
});

test("a lifecycle refusal whose decision cannot be stored still fails the event", async () => {
  const { response, calls } = await run(
    {
      decisionError: new Error("decision down"),
      rpcAnswer: { data: null, error: { message: "account lifecycle: user is not active" } },
    },
    { order_id: "ppc-1", payment_status: "success", sum: "190.00" }
  );
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "decision storage failed");
  assert.equal(calls.settled.length, 0);
});
