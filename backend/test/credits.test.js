"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * The credits wrapper is small but it is the only path from an HTTP route to the
 * atomic ledger RPC. Its contract matters: the account id must be sent as text
 * (the SQL function compares `id::text`), a missing description must become SQL
 * NULL instead of the string "undefined", and a database error must not be
 * swallowed into a successful balance value.
 */

// Replace the shared Supabase client with a controllable double. `credits.js`
// resolves the client at require time, so the stub is installed first.
const supabasePath = require.resolve("../supabase");
let client = null;
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    from: (...args) => client.from(...args),
    rpc: (...args) => client.rpc(...args),
  },
};

const { getBalance, adjustBalance } = require("../credits");

test("getBalance returns the stored balance for the requested account", async () => {
  const calls = [];
  client = {
    from(table) {
      return {
        select(columns) {
          assert.equal(columns, "credits_balance");
          return {
            eq(column, value) {
              calls.push({ table, column, value });
              return {
                single: async () => ({ data: { credits_balance: 42 }, error: null }),
              };
            },
          };
        },
      };
    },
  };

  assert.equal(await getBalance("11111111-1111-4111-8111-111111111111"), 42);
  assert.deepEqual(calls, [{
    table: "users",
    column: "id",
    value: "11111111-1111-4111-8111-111111111111",
  }]);
});

test("getBalance propagates a database failure instead of reporting a balance", async () => {
  const failure = Object.assign(new Error("boom"), { code: "XX000" });
  client = {
    from() {
      return {
        select() {
          return { eq: () => ({ single: async () => ({ data: null, error: failure }) }) };
        },
      };
    },
  };

  await assert.rejects(getBalance("user-1"), (error) => error === failure);
});

test("adjustBalance calls the atomic ledger RPC with a text user id", async () => {
  const calls = [];
  client = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: 150, error: null };
    },
  };

  assert.equal(await adjustBalance(12345, 100, "topup", "Тестовое пополнение"), 150);
  assert.deepEqual(calls, [{
    name: "adjust_credits_balance_and_log",
    args: {
      p_user_id: "12345",
      p_amount: 100,
      p_type: "topup",
      p_description: "Тестовое пополнение",
    },
  }]);
});

test("adjustBalance sends SQL NULL when no description is supplied", async () => {
  const calls = [];
  client = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: 0, error: null };
    },
  };

  await adjustBalance("user-1", -5, "usage");
  assert.equal(calls[0].args.p_description, null);
  await adjustBalance("user-1", -5, "usage", "");
  assert.equal(calls[1].args.p_description, null);
});

test("adjustBalance surfaces the database message and code", async () => {
  client = {
    async rpc() {
      return { data: null, error: { code: "P0001", message: "insufficient credits" } };
    },
  };

  await assert.rejects(
    adjustBalance("user-1", -1000, "usage"),
    (error) => error.message === "insufficient credits" && error.code === "P0001"
  );

  client = { async rpc() { return { data: null, error: { message: "" } }; } };
  await assert.rejects(adjustBalance("user-1", 1, "topup"), /Не удалось изменить баланс/);
});
