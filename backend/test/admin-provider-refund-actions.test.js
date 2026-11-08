const test = require("node:test");
const assert = require("node:assert/strict");

const supabasePath = require.resolve("../supabase");
const modulePath = require.resolve("../adminProviderRefundActions");
const calls = [];
let rpcResult = { data: "2026-11-08T12:00:00.000Z", error: null };

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
const actions = require("../adminProviderRefundActions");

const OPERATOR_ID = "a6d1b2c3-4e5f-4678-9abc-0123456789ab";
const ACTION_ID = "b6d1b2c3-4e5f-4678-9abc-0123456789ab";

function reset() {
  calls.length = 0;
  rpcResult = { data: "2026-11-08T12:00:00.000Z", error: null };
}

test("generation reconciliation derives operator identity from the authenticated caller", async () => {
  reset();
  const result = await actions.reconcileGeneration(OPERATOR_ID, {
    request_id: "9223372036854775807",
    task_index: 3,
    provider_refunded: false,
    evidence_type: "provider_dashboard",
    evidence_reference: "ticket-2026-001",
    action_id: ACTION_ID,
    operator_user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    p_operator_user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "admin_reconcile_pin_generation_provider_refund");
  assert.deepEqual(calls[0].args, {
    p_operator_user_id: OPERATOR_ID,
    p_request_id: "9223372036854775807",
    p_task_index: 3,
    p_provider_refunded: false,
    p_evidence_type: "provider_dashboard",
    p_evidence_reference: "ticket-2026-001",
    p_action_id: ACTION_ID,
  });
  assert.equal(result.ok, true);
  assert.equal(result.request_id, "9223372036854775807");
  assert.equal(result.recorded_at, rpcResult.data);
});

test("regeneration reconciliation uses task index zero and a narrow RPC payload", async () => {
  reset();
  await actions.reconcileRegeneration(OPERATOR_ID, {
    request_id: 27,
    provider_refunded: true,
    evidence_type: "provider_support",
    evidence_reference: "support-case-0001",
    action_id: ACTION_ID,
  });

  assert.equal(calls[0].name, "admin_reconcile_pin_regeneration_provider_refund");
  assert.deepEqual(calls[0].args, {
    p_operator_user_id: OPERATOR_ID,
    p_request_id: "27",
    p_provider_refunded: true,
    p_evidence_type: "provider_support",
    p_evidence_reference: "support-case-0001",
    p_action_id: ACTION_ID,
  });
});

test("finalization methods call only their matching narrow RPCs", async () => {
  reset();
  await actions.finalizeGeneration(OPERATOR_ID, { request_id: "42", action_id: ACTION_ID });
  await actions.finalizeRegeneration(OPERATOR_ID, { request_id: "43", action_id: ACTION_ID });

  assert.equal(calls[0].name, "admin_finalize_reconciled_pin_generation_failure");
  assert.equal(calls[1].name, "admin_finalize_reconciled_pin_regeneration_failure");
  assert.equal(calls[0].args.p_operator_user_id, OPERATOR_ID);
  assert.equal(calls[0].args.p_request_id, "42");
  assert.equal(calls[1].args.p_request_id, "43");
  assert.equal(Object.keys(calls[0].args).sort().join(","), "p_action_id,p_operator_user_id,p_request_id");
});

test("invalid IDs, task indexes, refund facts, and evidence are rejected before RPC", async () => {
  reset();
  const base = {
    request_id: "12",
    task_index: 1,
    provider_refunded: true,
    evidence_type: "provider_dashboard",
    evidence_reference: "ticket-0001",
    action_id: ACTION_ID,
  };

  await assert.rejects(actions.reconcileGeneration(OPERATOR_ID, { ...base, request_id: "1.5" }), { httpStatus: 422 });
  await assert.rejects(actions.reconcileGeneration(OPERATOR_ID, { ...base, task_index: 0 }), { httpStatus: 422 });
  await assert.rejects(actions.reconcileGeneration(OPERATOR_ID, { ...base, provider_refunded: "false" }), { httpStatus: 422 });
  await assert.rejects(actions.reconcileGeneration(OPERATOR_ID, { ...base, evidence_reference: "https://example.com/ticket" }), { httpStatus: 422 });
  await assert.rejects(actions.reconcileGeneration(OPERATOR_ID, { ...base, evidence_reference: "a@b.example" }), { httpStatus: 422 });
  await assert.rejects(actions.finalizeGeneration(OPERATOR_ID, { request_id: "9223372036854775808", action_id: ACTION_ID }), { httpStatus: 422 });
  await assert.rejects(actions.finalizeGeneration(OPERATOR_ID, { request_id: "12", action_id: "not-a-uuid" }), { httpStatus: 422 });

  assert.equal(calls.length, 0);
});

test("database authorization and conflict errors are mapped to safe HTTP errors", async () => {
  reset();
  rpcResult = { data: null, error: { message: "administrator privileges required" } };
  await assert.rejects(
    actions.finalizeGeneration(OPERATOR_ID, { request_id: "12", action_id: ACTION_ID }),
    { httpStatus: 403, message: "Доступ запрещён" }
  );

  reset();
  rpcResult = { data: null, error: { message: "action id replay payload mismatch" } };
  await assert.rejects(
    actions.finalizeGeneration(OPERATOR_ID, { request_id: "12", action_id: ACTION_ID }),
    { httpStatus: 409 }
  );

  reset();
  rpcResult = { data: null, error: { message: "generation request not found" } };
  await assert.rejects(
    actions.finalizeGeneration(OPERATOR_ID, { request_id: "12", action_id: ACTION_ID }),
    { httpStatus: 404, message: "Операция или задача не найдена" }
  );

  reset();
  rpcResult = { data: null, error: { message: "invalid generation reconciliation finalization" } };
  await assert.rejects(
    actions.finalizeGeneration(OPERATOR_ID, { request_id: "12", action_id: ACTION_ID }),
    { httpStatus: 422 }
  );

  reset();
  rpcResult = { data: null, error: { message: "generation request was not finalized by refund reconciliation" } };
  await assert.rejects(
    actions.finalizeGeneration(OPERATOR_ID, { request_id: "12", action_id: ACTION_ID }),
    { httpStatus: 409 }
  );

  reset();
  rpcResult = { data: null, error: { message: "secret database detail" } };
  await assert.rejects(
    actions.finalizeGeneration(OPERATOR_ID, { request_id: "12", action_id: ACTION_ID }),
    { httpStatus: 500, message: "Не удалось выполнить административную операцию" }
  );
});
