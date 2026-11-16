"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

let rpcResult;
const rpcCalls = [];
const supabasePath = require.resolve("../supabase");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      return rpcResult;
    },
  },
};

const { failPaymentCreation } = require("../paymentCreationIdempotency");

test("failPaymentCreation returns true only after the RPC confirms the state transition", async () => {
  rpcCalls.length = 0;
  rpcResult = { data: true, error: null };
  assert.equal(await failPaymentCreation("user-1", "payment-request-key-001", new Error("provider_rejected")), true);
  assert.deepEqual(rpcCalls, [{
    name: "fail_payment_creation_request",
    args: {
      p_user_id: "user-1",
      p_idempotency_key: "payment-request-key-001",
      p_error_code: "Error",
    },
  }]);

  rpcResult = { data: false, error: null };
  assert.equal(await failPaymentCreation("user-1", "payment-request-key-001", new Error("provider_rejected")), false);
});
