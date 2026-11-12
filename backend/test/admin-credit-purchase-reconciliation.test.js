const test = require("node:test");
const assert = require("node:assert/strict");

const supabasePath = require.resolve("../supabase");
const modulePath = require.resolve("../adminCreditPurchaseReconciliation");
const calls = [];
let rpcResult = { data: "2026-11-12T12:00:00.000Z", error: null };

const supabaseMock = {
  async rpc(name, args) {
    calls.push({ name, args });
    return rpcResult;
  },
};

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: supabaseMock,
};
delete require.cache[modulePath];
const reconciliation = require("../adminCreditPurchaseReconciliation");

const OPERATOR_ID = "a6d1b2c3-4e5f-4678-9abc-0123456789ab";
const PURCHASE_ID = "c6d1b2c3-4e5f-4678-9abc-0123456789ab";
const ACTION_ID = "d6d1b2c3-4e5f-4678-9abc-0123456789ab";

function reset() {
  calls.length = 0;
  rpcResult = { data: "2026-11-12T12:00:00.000Z", error: null };
}

test("records provider-confirmed refund using authenticated operator identity", async () => {
  reset();
  const result = await reconciliation.recordProviderRefund(OPERATOR_ID, {
    purchase_id: PURCHASE_ID,
    action_id: ACTION_ID,
    evidence_type: "provider_dashboard",
    evidence_reference: "refund-case-2026-001",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "admin_record_credit_purchase_refund");
  assert.deepEqual(calls[0].args, {
    p_operator_user_id: OPERATOR_ID,
    p_purchase_id: PURCHASE_ID,
    p_action_id: ACTION_ID,
    p_evidence_type: "provider_dashboard",
    p_evidence_reference: "refund-case-2026-001",
  });
  assert.equal(result.ok, true);
  assert.equal(result.purchase_id, PURCHASE_ID);
  assert.equal(result.action_kind, "provider_refund_confirmed");
  assert.equal(result.recorded_at, rpcResult.data);
});

test("records a provider-confirmed subscription refund with a narrow RPC payload", async () => {
  reset();
  const result = await reconciliation.recordSubscriptionProviderRefund(OPERATOR_ID, {
    subscription_id: PURCHASE_ID,
    action_id: ACTION_ID,
    evidence_type: "provider_support",
    evidence_reference: "support-case-2026-092",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "admin_record_subscription_provider_refund");
  assert.deepEqual(calls[0].args, {
    p_operator_user_id: OPERATOR_ID,
    p_subscription_id: PURCHASE_ID,
    p_action_id: ACTION_ID,
    p_evidence_type: "provider_support",
    p_evidence_reference: "support-case-2026-092",
  });
  assert.equal(result.subscription_id, PURCHASE_ID);
  assert.equal(result.action_kind, "provider_refund_confirmed");
});

test("subscription refund action rejects purchase fields and unsafe payloads", async () => {
  reset();
  await assert.rejects(reconciliation.recordSubscriptionProviderRefund(OPERATOR_ID, {
    subscription_id: PURCHASE_ID,
    purchase_id: PURCHASE_ID,
    action_id: ACTION_ID,
    evidence_type: "provider_dashboard",
    evidence_reference: "refund-case-2026-092",
  }), { httpStatus: 422 });
  await assert.rejects(reconciliation.recordSubscriptionProviderRefund(OPERATOR_ID, {
    subscription_id: PURCHASE_ID,
    action_id: ACTION_ID,
    evidence_type: "provider_dashboard",
    evidence_reference: "https://provider.example/refund",
  }), { httpStatus: 422 });
  assert.equal(calls.length, 0);
});

test("rejects malformed identifiers, unsafe evidence, and extra fields before RPC", async () => {
  reset();
  const body = {
    purchase_id: PURCHASE_ID,
    action_id: ACTION_ID,
    evidence_type: "provider_dashboard",
    evidence_reference: "refund-case-2026-001",
  };

  await assert.rejects(
    reconciliation.recordProviderRefund(OPERATOR_ID, { ...body, purchase_id: "not-a-uuid" }),
    { httpStatus: 422 }
  );
  await assert.rejects(
    reconciliation.recordProviderRefund(OPERATOR_ID, { ...body, action_id: "not-a-uuid" }),
    { httpStatus: 422 }
  );
  await assert.rejects(
    reconciliation.recordProviderRefund(OPERATOR_ID, { ...body, evidence_reference: "https://provider.example/refund" }),
    { httpStatus: 422 }
  );
  await assert.rejects(
    reconciliation.recordProviderRefund(OPERATOR_ID, { ...body, evidence_reference: "provider.example/refund" }),
    { httpStatus: 422 }
  );
  await assert.rejects(
    reconciliation.recordProviderRefund(OPERATOR_ID, { ...body, is_admin: true }),
    { httpStatus: 422 }
  );
  await assert.rejects(
    reconciliation.recordProviderRefund("not-a-uuid", body),
    { httpStatus: 401 }
  );
  assert.equal(calls.length, 0);
});

test("maps database authorization, conflict, and missing-purchase errors safely", async () => {
  reset();
  rpcResult = { data: null, error: { message: "administrator privileges required" } };
  await assert.rejects(
    reconciliation.recordProviderRefund(OPERATOR_ID, {
      purchase_id: PURCHASE_ID, action_id: ACTION_ID,
      evidence_type: "provider_dashboard", evidence_reference: "refund-case-2026-001",
    }),
    { httpStatus: 403 }
  );

  reset();
  rpcResult = { data: null, error: { message: "credit purchase is not awaiting refund reconciliation" } };
  await assert.rejects(
    reconciliation.recordProviderRefund(OPERATOR_ID, {
      purchase_id: PURCHASE_ID, action_id: ACTION_ID,
      evidence_type: "provider_dashboard", evidence_reference: "refund-case-2026-001",
    }),
    { httpStatus: 409 }
  );

  reset();
  rpcResult = { data: null, error: { message: "credit purchase not found" } };
  await assert.rejects(
    reconciliation.recordProviderRefund(OPERATOR_ID, {
      purchase_id: PURCHASE_ID, action_id: ACTION_ID,
      evidence_type: "provider_dashboard", evidence_reference: "refund-case-2026-001",
    }),
    { httpStatus: 404 }
  );
});
