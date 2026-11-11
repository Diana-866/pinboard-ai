const test = require("node:test");
const assert = require("node:assert/strict");

process.env.PRODAMUS_SHOP_ID = "pinposy";
process.env.PRODAMUS_SECRET = "unit-test-secret";
process.env.PRODAMUS_DEMO = "1";

const db = {
  users: [{ id: "ambiguous-user", email: "ambiguous@example.invalid" }],
  subscriptions: [],
  credit_purchases: [],
  paymentRequests: new Map(),
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

function rpc(name, args) {
  const key = `${args.p_user_id}:${args.p_idempotency_key}`;
  if (name === "begin_payment_creation_request") {
    const existing = db.paymentRequests.get(key);
    if (!existing) {
      db.paymentRequests.set(key, {
        status: "creating",
        kind: args.p_request_kind,
        fingerprint: args.p_request_fingerprint,
      });
      return Promise.resolve({ data: { status: "started" }, error: null });
    }
    if (existing.kind !== args.p_request_kind || existing.fingerprint !== args.p_request_fingerprint) {
      return Promise.resolve({ data: null, error: { message: "idempotency key reused with different payment request" } });
    }
    return Promise.resolve({
      data: existing.status === "ready"
        ? { status: "ready", result: existing.result }
        : { status: existing.status },
      error: null,
    });
  }
  const existing = db.paymentRequests.get(key);
  if (!existing) return Promise.resolve({ data: null, error: { message: "request not found" } });
  if (name === "attach_payment_creation_order") {
    existing.providerOrderId = args.p_order_id;
    return Promise.resolve({ data: true, error: null });
  }
  if (name === "mark_payment_creation_unknown") {
    existing.status = "unknown";
    return Promise.resolve({ data: true, error: null });
  }
  if (name === "fail_payment_creation_request") {
    existing.status = "failed";
    return Promise.resolve({ data: true, error: null });
  }
  if (name === "complete_payment_creation_request") {
    existing.status = "ready";
    existing.result = args.p_result;
    return Promise.resolve({ data: args.p_result, error: null });
  }
  return Promise.resolve({ data: null, error: { message: `unexpected rpc: ${name}` } });
}

const supabasePath = require.resolve("../supabase");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { from: query, rpc },
};

const prodamus = require("../prodamus");
const billing = require("../billing");
const creditsBilling = require("../creditsBilling");

test("subscription remains pending when Prodamus link request has an ambiguous outcome", async () => {
  const original = prodamus.createPaymentLink;
  let providerCalls = 0;
  prodamus.createPaymentLink = async () => {
    providerCalls += 1;
    const error = new Error("simulated socket timeout after provider accepted request");
    error.code = "ECONNRESET";
    throw error;
  };

  try {
    await assert.rejects(
      billing.createPayment("ambiguous-user", { plan: "start", currency: "rub" }, "subscription-retry-key-001"),
      /simulated socket timeout/
    );
    assert.equal(db.subscriptions.length, 1);
    assert.equal(db.subscriptions[0].status, "pending");
    assert.ok(db.subscriptions[0].provider_payment_id);
    assert.equal(db.paymentRequests.get("ambiguous-user:subscription-retry-key-001").providerOrderId, db.subscriptions[0].provider_payment_id);
    await assert.rejects(
      billing.createPayment("ambiguous-user", { plan: "start", currency: "rub" }, "subscription-retry-key-001"),
      /Повторное создание заблокировано|неопределён/
    );
    assert.equal(providerCalls, 1, "a retry must not create a second Prodamus invoice");
    assert.equal(db.subscriptions.length, 1);
  } finally {
    prodamus.createPaymentLink = original;
  }
});

test("credit purchase remains pending when Prodamus link request has an ambiguous outcome", async () => {
  const original = prodamus.createPaymentLink;
  let providerCalls = 0;
  prodamus.createPaymentLink = async () => {
    providerCalls += 1;
    const error = new Error("simulated gateway timeout after provider accepted request");
    error.code = "ETIMEDOUT";
    throw error;
  };

  try {
    await assert.rejects(
      creditsBilling.createCreditsPayment("ambiguous-user", { package_id: "pack_100" }, "credits-retry-key-001"),
      /simulated gateway timeout/
    );
    assert.equal(db.credit_purchases.length, 1);
    assert.equal(db.credit_purchases[0].status, "pending");
    assert.ok(db.credit_purchases[0].provider_payment_id);
    assert.equal(db.paymentRequests.get("ambiguous-user:credits-retry-key-001").providerOrderId, db.credit_purchases[0].provider_payment_id);
    assert.equal(db.credit_purchases[0].balance_credited_at, undefined);
    await assert.rejects(
      creditsBilling.createCreditsPayment("ambiguous-user", { package_id: "pack_100" }, "credits-retry-key-001"),
      /Повторное создание заблокировано|неопределён/
    );
    assert.equal(providerCalls, 1, "a retry must not create a second Prodamus invoice");
    assert.equal(db.credit_purchases.length, 1);
  } finally {
    prodamus.createPaymentLink = original;
  }
});


test("successful subscription checkout is replayed from the durable idempotency result", async () => {
  const original = prodamus.createPaymentLink;
  let providerCalls = 0;
  prodamus.createPaymentLink = async ({ orderId }) => {
    providerCalls += 1;
    return { url: `https://pinposy.payform.ru/pay/${orderId}` };
  };
  try {
    const first = await billing.createPayment(
      "ambiguous-user", { plan: "pro", currency: "usd" }, "subscription-success-key-001"
    );
    const replay = await billing.createPayment(
      "ambiguous-user", { plan: "pro", currency: "usd" }, "subscription-success-key-001"
    );
    assert.equal(replay.order_id, first.order_id);
    assert.equal(replay.payment_url, first.payment_url);
    assert.equal(providerCalls, 1);
  } finally {
    prodamus.createPaymentLink = original;
  }
});


test("successful credit checkout is replayed from the durable idempotency result", async () => {
  // Isolate from rows and payment requests created by earlier cases in this file.
  db.credit_purchases.length = 0;
  db.paymentRequests.clear();
  const original = prodamus.createPaymentLink;
  let providerCalls = 0;
  prodamus.createPaymentLink = async ({ orderId }) => {
    providerCalls += 1;
    return { url: `https://pinposy.payform.ru/pay/${orderId}` };
  };
  try {
    const first = await creditsBilling.createCreditsPayment(
      "ambiguous-user", { package_id: "pack_500" }, "credits-success-key-001"
    );
    const replay = await creditsBilling.createCreditsPayment(
      "ambiguous-user", { package_id: "pack_500" }, "credits-success-key-001"
    );
    assert.equal(replay.order_id, first.order_id);
    assert.equal(replay.payment_url, first.payment_url);
    assert.equal(providerCalls, 1);
    assert.equal(db.credit_purchases.length, 1);
  } finally {
    prodamus.createPaymentLink = original;
  }
});

test("concurrent duplicate subscription checkout requests create only one provider invoice", async () => {
  const original = prodamus.createPaymentLink;
  let providerCalls = 0;
  prodamus.createPaymentLink = async ({ orderId }) => {
    providerCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { url: `https://pinposy.payform.ru/pay/${orderId}` };
  };
  try {
    const results = await Promise.allSettled([
      billing.createPayment("ambiguous-user", { plan: "analytics", currency: "rub" }, "subscription-race-key-001"),
      billing.createPayment("ambiguous-user", { plan: "analytics", currency: "rub" }, "subscription-race-key-001"),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(providerCalls, 1);
  } finally {
    prodamus.createPaymentLink = original;
  }
});

test("pre-provider subscription failure is fenced and can be retried only with a fresh key", async () => {
  const original = prodamus.createPaymentLink;
  let providerCalls = 0;
  prodamus.createPaymentLink = async () => {
    providerCalls += 1;
    return { url: "https://pinposy.payform.ru/unexpected" };
  };
  try {
    await assert.rejects(
      billing.createPayment("missing-user", { plan: "start", currency: "rub" }, "subscription-failed-key-001"),
      /Пользователь не найден/
    );
    await assert.rejects(
      billing.createPayment("missing-user", { plan: "start", currency: "rub" }, "subscription-failed-key-001"),
      (error) => error.httpStatus === 409 && error.details?.code === "payment_request_not_reusable"
    );
    assert.equal(providerCalls, 0, "a pre-provider failure must never call Prodamus");
    assert.equal(
      db.paymentRequests.get("missing-user:subscription-failed-key-001").status,
      "failed"
    );
  } finally {
    prodamus.createPaymentLink = original;
  }
});
