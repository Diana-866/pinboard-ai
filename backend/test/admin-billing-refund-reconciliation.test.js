const test = require("node:test");
const assert = require("node:assert/strict");

const supabasePath = require.resolve("../supabase");
const modulePath = require.resolve("../adminBillingRefundReconciliation");
const calls = [];
let rpcResult = { data: "2026-11-12T12:00:00.000Z", error: null };

const supabaseMock = {
  async rpc(name, args) {
    calls.push({ name, args });
    return rpcResult;
  },
};

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseMock,
};
delete require.cache[modulePath];
const actions = require("../adminBillingRefundReconciliation");

const OPERATOR = "a6d1b2c3-4e5f-4678-9abc-0123456789ab";
const PURCHASE = "c6d1b2c3-4e5f-4678-9abc-0123456789ab";
const SUBSCRIPTION = "e6d1b2c3-4e5f-4678-9abc-0123456789ab";
const ACTION = "d6d1b2c3-4e5f-4678-9abc-0123456789ab";

function reset() {
  calls.length = 0;
  rpcResult = { data: "2026-11-12T12:00:00.000Z", error: null };
}

test("credit refund action calls the protected RPC with the authenticated operator", async () => {
  reset();
  const result = await actions.recordProviderRefund(OPERATOR, {
    purchase_id: PURCHASE, action_id: ACTION,
    evidence_type: "provider_dashboard", evidence_reference: "refund-case-2026-001",
  });
  assert.equal(calls[0].name, "admin_record_credit_purchase_refund");
  assert.deepEqual(calls[0].args, {
    p_operator_user_id: OPERATOR, p_purchase_id: PURCHASE, p_action_id: ACTION,
    p_evidence_type: "provider_dashboard", p_evidence_reference: "refund-case-2026-001",
  });
  assert.equal(result.purchase_id, PURCHASE);
  assert.equal(result.action_kind, "provider_refund_confirmed");
});

test("subscription refund action calls its matching protected RPC", async () => {
  reset();
  const result = await actions.recordSubscriptionProviderRefund(OPERATOR, {
    subscription_id: SUBSCRIPTION, action_id: ACTION,
    evidence_type: "provider_support", evidence_reference: "support-case-2026-092",
  });
  assert.equal(calls[0].name, "admin_record_subscription_provider_refund");
  assert.deepEqual(calls[0].args, {
    p_operator_user_id: OPERATOR, p_subscription_id: SUBSCRIPTION, p_action_id: ACTION,
    p_evidence_type: "provider_support", p_evidence_reference: "support-case-2026-092",
  });
  assert.equal(result.subscription_id, SUBSCRIPTION);
});

test("rejects unsafe identifiers, URLs, and unexpected fields before RPC", async () => {
  reset();
  const valid = {
    purchase_id: PURCHASE, action_id: ACTION,
    evidence_type: "provider_dashboard", evidence_reference: "refund-case-2026-001",
  };
  await assert.rejects(actions.recordProviderRefund(OPERATOR, { ...valid, purchase_id: "bad" }), { httpStatus: 422 });
  await assert.rejects(actions.recordProviderRefund(OPERATOR, { ...valid, evidence_reference: "https://provider.example/refund" }), { httpStatus: 422 });
  await assert.rejects(actions.recordProviderRefund(OPERATOR, { ...valid, evidence_reference: "provider.example/refund" }), { httpStatus: 422 });
  await assert.rejects(actions.recordProviderRefund(OPERATOR, { ...valid, operator_user_id: OPERATOR }), { httpStatus: 422 });
  await assert.rejects(actions.recordProviderRefund("bad", valid), { httpStatus: 401 });
  await assert.rejects(actions.recordSubscriptionProviderRefund(OPERATOR, {
    subscription_id: SUBSCRIPTION, purchase_id: PURCHASE, action_id: ACTION,
    evidence_type: "provider_dashboard", evidence_reference: "refund-case-2026-092",
  }), { httpStatus: 422 });
  assert.equal(calls.length, 0);
});

test("maps authorization, missing record, and reconciliation conflicts safely", async () => {
  reset();
  rpcResult = { data: null, error: { message: "administrator privileges required" } };
  await assert.rejects(actions.recordProviderRefund(OPERATOR, {
    purchase_id: PURCHASE, action_id: ACTION,
    evidence_type: "provider_dashboard", evidence_reference: "refund-case-2026-001",
  }), { httpStatus: 403 });

  reset();
  rpcResult = { data: null, error: { message: "credit purchase is not awaiting refund reconciliation" } };
  await assert.rejects(actions.recordProviderRefund(OPERATOR, {
    purchase_id: PURCHASE, action_id: ACTION,
    evidence_type: "provider_dashboard", evidence_reference: "refund-case-2026-001",
  }), { httpStatus: 409 });

  reset();
  rpcResult = { data: null, error: { message: "subscription user not found" } };
  await assert.rejects(actions.recordSubscriptionProviderRefund(OPERATOR, {
    subscription_id: SUBSCRIPTION, action_id: ACTION,
    evidence_type: "provider_dashboard", evidence_reference: "refund-case-2026-092",
  }), { httpStatus: 404 });
});
