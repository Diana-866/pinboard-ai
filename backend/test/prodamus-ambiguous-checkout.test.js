const test = require("node:test");
const assert = require("node:assert/strict");

process.env.PRODAMUS_SHOP_ID = "pinposy";
process.env.PRODAMUS_SECRET = "unit-test-secret";
process.env.PRODAMUS_DEMO = "1";

const db = {
  users: [{ id: "ambiguous-user", email: "ambiguous@example.invalid" }],
  subscriptions: [],
  credit_purchases: [],
};

function query(tableName) {
  const state = { operation: "select", payload: null, filters: {} };
  const builder = {
    select() { return builder; },
    insert(payload) {
      state.operation = "insert";
      state.payload = payload;
      return builder;
    },
    eq(column, value) {
      state.filters[column] = value;
      return builder;
    },
    single() {
      if (state.operation === "insert") {
        const row = {
          id: `test-${tableName}-${db[tableName].length + 1}`,
          created_at: new Date().toISOString(),
          ...state.payload,
        };
        db[tableName].push(row);
        return Promise.resolve({ data: row, error: null });
      }
      const row = db[tableName].find((candidate) =>
        Object.entries(state.filters).every(([key, value]) => candidate[key] === value)
      );
      return Promise.resolve({
        data: row || null,
        error: row ? null : { message: "not found" },
      });
    },
  };
  return builder;
}

const supabasePath = require.resolve("../supabase");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { from: query },
};

const prodamus = require("../prodamus");
const billing = require("../billing");
const creditsBilling = require("../creditsBilling");

test("subscription remains pending when Prodamus link request has an ambiguous outcome", async () => {
  const original = prodamus.createPaymentLink;
  prodamus.createPaymentLink = async () => {
    const error = new Error("simulated socket timeout after provider accepted request");
    error.code = "ECONNRESET";
    throw error;
  };

  try {
    await assert.rejects(
      billing.createPayment("ambiguous-user", { plan: "start", currency: "rub" }),
      /simulated socket timeout/
    );
    assert.equal(db.subscriptions.length, 1);
    assert.equal(db.subscriptions[0].status, "pending");
    assert.ok(db.subscriptions[0].provider_payment_id);
  } finally {
    prodamus.createPaymentLink = original;
  }
});

test("credit purchase remains pending when Prodamus link request has an ambiguous outcome", async () => {
  const original = prodamus.createPaymentLink;
  prodamus.createPaymentLink = async () => {
    const error = new Error("simulated gateway timeout after provider accepted request");
    error.code = "ETIMEDOUT";
    throw error;
  };

  try {
    await assert.rejects(
      creditsBilling.createCreditsPayment("ambiguous-user", { package_id: "pack_100" }),
      /simulated gateway timeout/
    );
    assert.equal(db.credit_purchases.length, 1);
    assert.equal(db.credit_purchases[0].status, "pending");
    assert.ok(db.credit_purchases[0].provider_payment_id);
    assert.equal(db.credit_purchases[0].balance_credited_at, undefined);
  } finally {
    prodamus.createPaymentLink = original;
  }
});
