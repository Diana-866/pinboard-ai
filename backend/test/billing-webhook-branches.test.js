"use strict";

const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");
const path = require("node:path");

/**
 * The subscription webhook is the other half of the money path: it activates a paid plan, and its
 * failure branches (28 of them) decided "activate or not" without ever executing - billing.js sat at
 * 87.41% lines with the whole webhook envelope uncovered.
 *
 * The handler is driven through its real composition; only the provider, the receipt/audit/
 * idempotency modules and the database are doubled, because each of those has its own tests.
 */

const BILLING = path.join(__dirname, "..", "billing.js");
const SUBSCRIPTION = {
  id: "subscription-1",
  user_id: "buyer-1",
  amount: 1990,
  currency: "rub",
  plan: "pro",
  status: "pending",
};

function freshBilling(options = {}) {
  const calls = { receipts: [], decisions: [], exceptions: [], settled: [], updates: [], rpcs: [], dispatched: 0 };
  const state = {
    subscription: options.subscription === undefined ? SUBSCRIPTION : options.subscription,
    lookupError: options.lookupError || null,
    updateError: options.updateError || null,
    verify: options.verify || { ok: true },
    normalizedStatus: options.normalizedStatus !== undefined ? options.normalizedStatus : "success",
    amount: options.amount || { ok: true, amount: 1990 },
    demoBlocked: options.demoBlocked === true,
    receiptError: options.receiptError || null,
    rpcAnswer: options.rpcAnswer || {
      data: { decision: "granted", plan: "pro", current_plan: "pro", period_end: "2026-02-01T00:00:00Z", already_activated: false },
      error: null,
    },
    settleError: options.settleError || null,
    dispatchError: options.dispatchError || null,
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
          if (calls.updates.length > 0) return Promise.resolve({ data: null, error: state.updateError }).then(resolve);
          return Promise.resolve({ data: state.subscription, error: state.lookupError }).then(resolve);
        },
        maybeSingle() {
          return Promise.resolve({ data: state.subscription, error: state.lookupError });
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
        return { receiptId: "receipt-s1" };
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

  delete require.cache[require.resolve(BILLING)];
  for (const [request, double] of Object.entries(doubles)) {
    const resolved = require.resolve(request);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: double };
  }
  const module = require(BILLING);
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

async function run(options = {}, body = { order_id: "pp-1", payment_status: "success", sum: "1990.00" }) {
  const handle = freshBilling(options);
  const response = createResponse();
  const dispatchPendingSubscriptionEmails = async (limit) => {
    handle.calls.dispatched += 1;
    if (handle.state.dispatchError) throw handle.state.dispatchError;
    return { processed: limit };
  };
  await handle.module.handleWebhook(
    { body, headers: { sign: "sig" } },
    response,
    { supabase: handle.db, dispatchPendingSubscriptionEmails }
  );
  return { ...handle, response };
}

test("a forged signature is refused and nothing is recorded", async () => {
  const { response, calls } = await run({ verify: { ok: false, reason: "bad signature" } });
  assert.equal(response.statusCode, 403);
  assert.equal(calls.receipts.length, 0);
  assert.equal(calls.rpcs.length, 0);
});

test("the verified provider fact is durable before the plan can be activated", async () => {
  const { response, calls } = await run({ lookupError: { message: "boom" } });
  assert.equal(response.statusCode, 500);
  assert.equal(calls.receipts.length, 1);
  assert.equal(calls.receipts[0].paymentKind, "subscription");
  assert.equal(response.body.error, "db error");
  assert.equal(calls.rpcs.length, 0);
});

test("an unstorable receipt stops the event before activation", async () => {
  const { response, calls } = await run({ receiptError: new Error("storage down") });
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "receipt storage failed");
  assert.equal(calls.rpcs.length, 0);
});

test("a demo payment never activates a plan in production", async () => {
  const { response, calls } = await run({ demoBlocked: true });
  assert.equal(response.statusCode, 503);
  assert.equal(calls.rpcs.length, 0);
});

test("an event without an order id is recorded and ignored", async () => {
  const { response, calls } = await run({}, { payment_status: "success", sum: "1990.00" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ignored, "no order_id");
  assert.equal(calls.exceptions[0].reason, "missing_order_id");
  assert.equal(calls.decisions[0].decision, "unmatched");
  assert.equal(calls.rpcs.length, 0);
});

test("an unknown order is recorded for review and never activates anything", async () => {
  const { response, calls } = await run({ subscription: null });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ignored, "unknown order_id");
  assert.equal(calls.decisions[0].reasonCode, "unknown_order_id");
  assert.equal(calls.rpcs.length, 0);
});

test("an unrecognised provider status goes to review", async () => {
  const { response, calls } = await run({ normalizedStatus: "" }, { order_id: "pp-1", payment_status: "provider-new-state", sum: "1990.00" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.review_required, true);
  assert.equal(calls.decisions[0].decision, "pending_review");
  assert.equal(calls.rpcs.length, 0);
});

test("a non-success status never downgrades an already successful subscription", async () => {
  const { response, calls } = await run({ normalizedStatus: "failed" }, { order_id: "pp-1", payment_status: "failed" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "failed");
  const update = calls.updates.find((entry) => entry.table === "subscriptions");
  assert.equal(update.payload.status, "failed");
  assert.equal(update.filters.status, "success", "the update must refuse to touch an already paid row");
  assert.equal(calls.rpcs.length, 0);
});

test("an unreadable amount is a mismatch for review", async () => {
  const { response, calls } = await run({ amount: { ok: false, reason: "invalid_payment_amount" } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ignored, "invalid_payment_amount");
  assert.equal(calls.decisions[0].decision, "rejected_mismatch");
  assert.equal(calls.rpcs.length, 0);
});

test("a paid amount that differs from the order is denied", async () => {
  const { response, calls } = await run({ amount: { ok: true, amount: 1 } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ignored, "amount mismatch");
  const update = calls.updates.find((entry) => entry.table === "subscriptions");
  assert.equal(update.payload.status, "denied");
  assert.equal(update.filters.status, "success");
  assert.equal(calls.rpcs.length, 0);
});

test("a matching payment activates the plan in one transaction and settles the checkout", async () => {
  const { response, calls } = await run();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "success");
  assert.equal(response.body.plan, "pro");
  assert.equal(response.body.paid_plan, "pro");
  assert.equal(response.body.idempotent, false);

  const rpc = calls.rpcs.find((entry) => entry.name === "activate_paid_subscription_with_receipt");
  assert.ok(rpc, "activation must go through the single transactional RPC");
  assert.equal(rpc.params.p_subscription_id, SUBSCRIPTION.id);
  assert.equal(rpc.params.p_receipt_id, "receipt-s1");
  assert.equal(calls.settled.length, 1);
  assert.equal(calls.settled[0].kind, "subscription");
  assert.equal(calls.dispatched, 1, "activating a plan must also flush the activation email outbox");
});

test("a duplicate callback is idempotent and still drains the outbox", async () => {
  // A process can commit activation and die before SMTP delivery. A duplicate callback is the only
  // second chance to send the email, so it must not skip the drain.
  const { response, calls } = await run({
    rpcAnswer: {
      data: { decision: "granted", plan: "pro", current_plan: "pro", period_end: "2026-02-01T00:00:00Z", already_activated: true },
      error: null,
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.idempotent, true);
  assert.equal(calls.rpcs.filter((entry) => entry.name === "activate_paid_subscription_with_receipt").length, 1);
  assert.equal(calls.dispatched, 1, "a duplicate callback must still try to deliver a stranded email");
});

test("a withheld activation is a decision, not an error the provider would retry", async () => {
  for (const decision of ["withheld_account_lifecycle", "rejected_mismatch"]) {
    const { response } = await run({ rpcAnswer: { data: { decision }, error: null } });
    assert.equal(response.statusCode, 200, `${decision} must not look like a transient failure`);
    assert.equal(response.body.decision, decision);
    assert.equal(response.body.review_required, true);
  }
});

test("an unknown activation answer is an error, never a silent success", async () => {
  const { response } = await run({ rpcAnswer: { data: { decision: "maybe" }, error: null } });
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "invalid fulfillment decision");
});

test("an activation that fails on a lifecycle refusal records the decision first", async () => {
  const { response, calls } = await run({ rpcAnswer: { data: null, error: { message: "account lifecycle: user is not active" } } });
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "activation failed");
  assert.equal(calls.decisions[0].decision, "withheld_account_lifecycle");
  assert.equal(calls.settled.length, 0);
});

test("an activation failure without a returned row is an error even when the call succeeded", async () => {
  const { response } = await run({ rpcAnswer: { data: null, error: null } });
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "activation failed");
});

test("a settlement failure keeps the event retryable", async () => {
  const { response, calls } = await run({ settleError: new Error("reconciliation down") });
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "payment reconciliation failed");
  assert.equal(calls.dispatched, 0, "no email drain should be reported as done when the checkout was not settled");
});

test("a failed email drain does not fail a paid activation", async () => {
  // The plan is active and the outbox is durable: reporting an error here would make the provider
  // retry a payment that is already fulfilled.
  const { response } = await run({ dispatchError: new Error("smtp down") });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "success");
});

test("an audit that cannot be written fails the event instead of ignoring the order", async () => {
  const { response, calls } = await run({ auditError: new Error("audit down") }, { payment_status: "success" });
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "audit storage failed");
  assert.equal(calls.rpcs.length, 0);
});

test("a decision that cannot be stored fails a non-success event while it is retryable", async () => {
  const { response, calls } = await run({ decisionError: new Error("decision down"), normalizedStatus: "failed" }, { order_id: "pp-1", payment_status: "failed" });
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "decision storage failed");
  assert.equal(calls.rpcs.length, 0);
});
