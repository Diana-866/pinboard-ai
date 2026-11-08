const test = require("node:test");
const assert = require("node:assert/strict");

const supabasePath = require.resolve("../supabase");
const modulePath = require.resolve("../adminPinterestReconciliation");
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
const actions = require("../adminPinterestReconciliation");

const OPERATOR_ID = "a6d1b2c3-4e5f-4678-9abc-0123456789ab";
const SCHEDULE_ID = "c6d1b2c3-4e5f-4678-9abc-0123456789ab";
const ACTION_ID = "b6d1b2c3-4e5f-4678-9abc-0123456789ab";

function payload(overrides = {}) {
  return {
    schedule_id: SCHEDULE_ID,
    pinterest_pin_id: "9876543210123",
    pinterest_board_id: "board-remote-42",
    evidence_type: "pinterest_dashboard",
    evidence_reference: "case-2026-001",
    action_id: ACTION_ID,
    ...overrides,
  };
}

function reset() {
  calls.length = 0;
  rpcResult = { data: "2026-11-08T12:00:00.000Z", error: null };
}

test("reconciliation calls only the narrow RPC and derives operator from authenticated identity", async () => {
  reset();
  const result = await actions.reconcileUnknownPublication(OPERATOR_ID, {
    ...payload(),
    user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    operator_user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    attempt_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    status: "scheduled",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "admin_reconcile_pinterest_unknown_publication");
  assert.deepEqual(calls[0].args, {
    p_operator_user_id: OPERATOR_ID,
    p_schedule_id: SCHEDULE_ID,
    p_pinterest_pin_id: "9876543210123",
    p_pinterest_board_id: "board-remote-42",
    p_evidence_type: "pinterest_dashboard",
    p_evidence_reference: "case-2026-001",
    p_action_id: ACTION_ID,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "published");
  assert.equal(result.recorded_at, rpcResult.data);
});

test("invalid UUIDs, remote IDs and evidence are rejected before RPC", async () => {
  reset();
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload({ schedule_id: "not-uuid" })), { httpStatus: 422 });
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload({ action_id: "not-uuid" })), { httpStatus: 422 });
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload({ pinterest_pin_id: " " })), { httpStatus: 422 });
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload({ pinterest_board_id: "x".repeat(201) })), { httpStatus: 422 });
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload({ evidence_type: "search_not_found" })), { httpStatus: 422 });
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload({ evidence_reference: "https://example.com/case-2026-001" })), { httpStatus: 422 });
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload({ evidence_reference: "example.com/case-2026" })), { httpStatus: 422 });
  assert.equal(calls.length, 0);
});

test("missing operator is rejected before RPC", async () => {
  reset();
  await assert.rejects(actions.reconcileUnknownPublication(null, payload()), { httpStatus: 401 });
  assert.equal(calls.length, 0);
});

test("database authorization, eligibility and identity conflicts map to safe HTTP errors", async () => {
  reset();
  rpcResult = { data: null, error: { message: "administrator privileges required" } };
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload()), { httpStatus: 403 });

  reset();
  rpcResult = { data: null, error: { message: "Pinterest schedule is not eligible for reconciliation" } };
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload()), { httpStatus: 409 });

  reset();
  rpcResult = { data: null, error: { message: "conflicting remote Pinterest publication identity" } };
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload()), { httpStatus: 409 });

  reset();
  rpcResult = { data: null, error: { message: "Pinterest schedule not found" } };
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload()), { httpStatus: 404 });

  reset();
  rpcResult = { data: null, error: { message: "private database details" } };
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload()), {
    httpStatus: 500,
    message: "Не удалось выполнить сверку публикации",
  });
});

test("concurrent duplicate schedule reconciliation is reported as a conflict, not a server failure", async () => {
  reset();
  rpcResult = {
    data: null,
    error: {
      code: "23505",
      message: 'duplicate key value violates unique constraint "pinterest_operator_reconciliations_schedule_unique"',
    },
  };
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload()), {
    httpStatus: 409,
    message: "Эта публикация уже сверяется или данные действия отличаются от ранее принятого запроса",
  });
});

test("replayed action ID with a different payload is reported as a conflict", async () => {
  reset();
  rpcResult = {
    data: null,
    error: {
      code: "23505",
      message: "action id replay payload mismatch",
    },
  };
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload()), {
    httpStatus: 409,
    message: "Эта публикация уже сверяется или данные действия отличаются от ранее принятого запроса",
  });
});

test("serialization race is reported as a retryable state conflict", async () => {
  reset();
  rpcResult = {
    data: null,
    error: { code: "40001", message: "could not serialize access due to concurrent update" },
  };
  await assert.rejects(actions.reconcileUnknownPublication(OPERATOR_ID, payload()), {
    httpStatus: 409,
    message: "Эта публикация уже сверяется или данные действия отличаются от ранее принятого запроса",
  });
});
