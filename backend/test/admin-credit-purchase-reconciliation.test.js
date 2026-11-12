const test = require("node:test");
const assert = require("node:assert/strict");

const supabasePath = require.resolve("../supabase");
const modulePath = require.resolve("../adminCreditPurchaseReconciliation");
const calls = [];
let rpcResult = { data: "2026-11-12T12:00:00.000Z", error: null };
const supabaseMock = {
  async rpc(name, args) { calls.push({ name, args }); return rpcResult; },
};
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseMock };
delete require.cache[modulePath];
const actions = require("../adminCreditPurchaseReconciliation");
const OPERATOR = "a6d1b2c3-4e5f-4678-9abc-0123456789ab";
const PURCHASE = "b6d1b2c3-4e5f-4678-9abc-0123456789ab";
const ACTION = "c6d1b2c3-4e5f-4678-9abc-0123456789ab";

function body(overrides = {}) {
  return {
    purchase_id: PURCHASE,
    action_id: ACTION,
    evidence_type: "provider_dashboard",
    evidence_reference: "refund-case-2026-001",
    ...overrides,
  };
}

test("records provider refund only through narrow audited RPC and authenticated operator", async () => {
  calls.length = 0;
  const result = await actions.recordProviderRefund(OPERATOR, body());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "admin_record_credit_purchase_refund");
  assert.deepEqual(calls[0].args, {
    p_operator_user_id: OPERATOR,
    p_purchase_id: PURCHASE,
    p_action_id: ACTION,
    p_evidence_type: "provider_dashboard",
    p_evidence_reference: "refund-case-2026-001",
  });
  assert.equal(result.ok, true);
  assert.equal(result.action, "provider_refund_confirmed");
  assert.equal(result.recorded_at, rpcResult.data);
});

test("rejects malformed, URL-based, or injected evidence before database access", async () => {
  calls.length = 0;
  await assert.rejects(actions.recordProviderRefund(OPERATOR, body({ purchase_id: "not-a-uuid" })), { httpStatus: 422 });
  await assert.rejects(actions.recordProviderRefund(OPERATOR, body({ action_id: "not-a-uuid" })), { httpStatus: 422 });
  await assert.rejects(actions.recordProviderRefund(OPERATOR, body({ evidence_type: "unknown" })), { httpStatus: 422 });
  await assert.rejects(actions.recordProviderRefund(OPERATOR, body({ evidence_reference: "https://example.com/refund-123" })), { httpStatus: 422 });
  await assert.rejects(actions.recordProviderRefund(OPERATOR, body({ evidence_reference: "short" })), { httpStatus: 422 });
  await assert.rejects(actions.recordProviderRefund(OPERATOR, { ...body(), is_admin: true }), { httpStatus: 422 });
  assert.equal(calls.length, 0);
});

test("maps missing purchases and stale/replayed actions to safe conflicts", async () => {
  rpcResult = { data: null, error: { message: "credit purchase not found" } };
  await assert.rejects(actions.recordProviderRefund(OPERATOR, body()), { httpStatus: 404 });
  rpcResult = { data: null, error: { message: "credit purchase is not awaiting refund reconciliation" } };
  await assert.rejects(actions.recordProviderRefund(OPERATOR, body()), { httpStatus: 409 });
  rpcResult = { data: null, error: { message: "administrator privileges required" } };
  await assert.rejects(actions.recordProviderRefund(OPERATOR, body()), { httpStatus: 403 });
});
