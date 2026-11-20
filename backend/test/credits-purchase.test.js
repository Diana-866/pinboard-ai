"use strict";

const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");

/**
 * The credit-pack purchase path was the least covered part of the money code: the catalogue and
 * the webhook were tested, the "create the invoice" function was not (lines 47-175 had no
 * coverage at all). That is the function where the price is chosen, the order row is created, the
 * provider is called and the link is handed to the customer - the four places where a mistake
 * costs a customer money or creates a second invoice.
 *
 * These checks pin the properties rather than the implementation: the price and the credit count
 * come from the server catalogue and never from the request, an idempotency key creates exactly
 * one provider invoice, every failure path either marks the request failed (so a retry is allowed)
 * or marks it unknown (so a retry is blocked until reconciliation), and the customer-facing
 * failure carries the machine code the client localizes.
 */

process.env.PRODAMUS_SHOP_ID = "pinposy";
process.env.PRODAMUS_SECRET = "unit-test-secret";
process.env.PRODAMUS_DEMO = "1";
process.env.PUBLIC_BACKEND_URL = "https://api.pinposy.test";
process.env.FRONTEND_URL = "https://pinposy.test";

const { CREDIT_PACKS } = require("../creditPacks");

/** A minimal PostgREST double: table queries, RPCs and an idempotency store in one object. */
function createDb() {
  const state = {
    users: [{ id: "buyer-1", email: "buyer@example.invalid" }],
    credit_purchases: [],
    requests: new Map(),
    calls: { insert: 0, update: 0, provider: 0 },
    failInsert: null,
    failAttach: false,
    failComplete: false,
    failUserLookup: false,
  };

  function from(table) {
    const filter = {};
    let operation = "select";
    let payload = null;
    let updating = null;
    const builder = {
      select() { return builder; },
      insert(row) { operation = "insert"; payload = row; return builder; },
      update(row) { operation = "update"; updating = row; return builder; },
      eq(column, value) { filter[column] = value; return builder; },
      is(column, value) { filter[column] = value; return builder; },
      neq(column, value) { filter[column] = value; return builder; },
      order() { return builder; },
      limit() { return builder; },
      maybeSingle() { return finish(); },
      single() { return finish(); },
      then(resolve, reject) { return finish().then(resolve, reject); },
    };

    function finish() {
      if (operation === "insert") {
        state.calls.insert += 1;
        if (state.failInsert) return Promise.resolve({ data: null, error: state.failInsert });
        const row = { id: `purchase-${state.credit_purchases.length + 1}`, ...payload };
        state.credit_purchases.push(row);
        return Promise.resolve({ data: row, error: null });
      }
      if (operation === "update") {
        state.calls.update += 1;
        let matched = null;
        for (const row of state.credit_purchases) {
          if (Object.entries(filter).every(([key, value]) => row[key] === value)) matched = row;
        }
        if (matched) Object.assign(matched, updating);
        // PostgREST returns the updated row, and the caller confirms the denial by its identity.
        return Promise.resolve({ data: matched ? { id: matched.id } : null, error: null });
      }
      if (table === "users") {
        if (state.failUserLookup) return Promise.resolve({ data: null, error: { message: "users unavailable" } });
        const row = state.users.find((candidate) => candidate.id === filter.id) || null;
        return Promise.resolve({ data: row, error: row ? null : { message: "no rows" } });
      }
      const rows = state.credit_purchases.filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value));
      return Promise.resolve({ data: rows, error: null });
    }

    return builder;
  }

  function rpc(name, args) {
    const key = `${args.p_user_id}:${args.p_idempotency_key}`;
    if (name === "begin_payment_creation_request") {
      const existing = state.requests.get(key);
      if (!existing) {
        state.requests.set(key, { status: "creating", fingerprint: args.p_request_fingerprint });
        return Promise.resolve({ data: { status: "started" }, error: null });
      }
      if (existing.fingerprint !== args.p_request_fingerprint) {
        return Promise.resolve({ data: null, error: { message: "idempotency key reused with different payment request" } });
      }
      if (existing.status === "ready") return Promise.resolve({ data: { status: "ready", result: existing.result }, error: null });
      return Promise.resolve({ data: { status: existing.status }, error: null });
    }
    const existing = state.requests.get(key);
    if (!existing && name !== "settle_payment_creation_request") {
      return Promise.resolve({ data: null, error: { message: "request not found" } });
    }
    if (name === "attach_payment_creation_order") {
      if (state.failAttach) return Promise.resolve({ data: null, error: { message: "attach failed" } });
      existing.orderId = args.p_order_id;
      return Promise.resolve({ data: true, error: null });
    }
    if (name === "complete_payment_creation_request") {
      if (state.failComplete) return Promise.resolve({ data: null, error: { message: "complete failed" } });
      existing.status = "ready";
      existing.result = args.p_result;
      return Promise.resolve({ data: args.p_result, error: null });
    }
    if (name === "fail_payment_creation_request") {
      existing.status = "failed";
      return Promise.resolve({ data: true, error: null });
    }
    if (name === "mark_payment_creation_unknown") {
      existing.status = "unknown";
      return Promise.resolve({ data: true, error: null });
    }
    return Promise.resolve({ data: true, error: null });
  }

  return { state, from, rpc };
}

function loadModules(db) {
  // Replace the shared Supabase client before anything requires it, and drop the modules that
  // already captured it so each test starts from the same wiring.
  const supabasePath = require.resolve("../supabase");
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: db };
  for (const relative of ["../creditsBilling", "../paymentCreationIdempotency", "../prodamus"]) {
    const resolved = require.resolve(relative);
    delete require.cache[resolved];
  }
  const creditsBilling = require("../creditsBilling");
  const prodamus = require("../prodamus");
  return { creditsBilling, prodamus };
}

/** Makes the provider answer with a predictable link and counts the calls. */
function stubProvider(prodamus, overrides = {}) {
  const calls = [];
  prodamus.createPaymentLink = async (request) => {
    calls.push(request);
    if (overrides.error) throw overrides.error;
    return { url: `https://pay.prodamus.test/${request.orderId}`, orderId: request.orderId };
  };
  prodamus.isConfigured = () => overrides.configured !== false;
  return calls;
}

const KEY = "credits-purchase-key-0001";

test("the price and the credit count come from the server catalogue, not from the request", async () => {
  const db = createDb();
  const { creditsBilling, prodamus } = loadModules(db);
  const calls = stubProvider(prodamus);

  const result = await creditsBilling.createCreditsPayment("buyer-1", {
    package_id: "pack_100",
    // A client that tries to choose its own price or its own credit count.
    amount: 1,
    credits: 999999,
    currency: "rub",
  }, KEY);

  const pack = CREDIT_PACKS.pack_100;
  assert.equal(result.amount, pack.amount.rub);
  assert.equal(result.credits, pack.credits);
  assert.equal(db.state.credit_purchases.length, 1);
  assert.equal(db.state.credit_purchases[0].amount, pack.amount.rub, "the stored order must carry the catalogue price");
  assert.equal(db.state.credit_purchases[0].credits, pack.credits, "the stored order must carry the catalogue credits");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].amount, pack.amount.rub, "the provider must be asked for the catalogue price");
  assert.match(result.payment_url, /^https:\/\/pay\.prodamus\.test\//);
  assert.equal(result.demo, true);
});

test("a bad package or currency is refused before any database or provider work", async () => {
  const db = createDb();
  const { creditsBilling, prodamus } = loadModules(db);
  const calls = stubProvider(prodamus);

  for (const body of [
    {},
    { package_id: "pack_999" },
    { package_id: 100 },
    { package_id: { id: "pack_100" } },
    { package_id: "pack_100", currency: "usd" },
  ]) {
    await assert.rejects(
      () => creditsBilling.createCreditsPayment("buyer-1", body, KEY),
      (error) => error.httpStatus === 422,
      `body ${JSON.stringify(body)} must be refused with 422`
    );
  }
  assert.equal(db.state.credit_purchases.length, 0, "nothing may be stored for an invalid request");
  assert.equal(db.state.requests.size, 0, "an invalid request must not reserve an idempotency key");
  assert.equal(calls.length, 0, "the provider must not be called for an invalid request");
});

test("a deployment without payment credentials answers 503 and reserves nothing", async () => {
  const db = createDb();
  const { creditsBilling, prodamus } = loadModules(db);
  const calls = stubProvider(prodamus, { configured: false });

  await assert.rejects(() => creditsBilling.createCreditsPayment("buyer-1", { package_id: "pack_100" }, KEY),
    (error) => error.httpStatus === 503);
  assert.equal(db.state.requests.size, 0, "a misconfigured deployment must not burn the customer's idempotency key");
  assert.equal(calls.length, 0);
});

test("one idempotency key creates exactly one invoice, and a replay returns the same link", async () => {
  const db = createDb();
  const { creditsBilling, prodamus } = loadModules(db);
  const calls = stubProvider(prodamus);

  const first = await creditsBilling.createCreditsPayment("buyer-1", { package_id: "pack_500" }, KEY);
  const replay = await creditsBilling.createCreditsPayment("buyer-1", { package_id: "pack_500" }, KEY);

  assert.equal(calls.length, 1, "a replay must not ask the provider for a second invoice");
  assert.equal(db.state.credit_purchases.length, 1, "a replay must not create a second order");
  assert.equal(replay.order_id, first.order_id);
  assert.equal(replay.payment_url, first.payment_url);
});

test("the same key with a different pack is refused instead of silently creating another order", async () => {
  const db = createDb();
  const { creditsBilling, prodamus } = loadModules(db);
  const calls = stubProvider(prodamus);

  await creditsBilling.createCreditsPayment("buyer-1", { package_id: "pack_100" }, KEY);
  await assert.rejects(
    () => creditsBilling.createCreditsPayment("buyer-1", { package_id: "pack_1000" }, KEY),
    (error) => error.httpStatus === 409 && error.details && error.details.code === "idempotency_key_reused"
  );
  assert.equal(calls.length, 1);
});

test("an unknown user fails the request so the customer can retry with the same key", async () => {
  const db = createDb();
  const { creditsBilling, prodamus } = loadModules(db);
  const calls = stubProvider(prodamus);

  await assert.rejects(() => creditsBilling.createCreditsPayment("ghost-1", { package_id: "pack_100" }, KEY),
    (error) => error.httpStatus === 404);
  assert.equal(db.state.requests.get("ghost-1:" + KEY).status, "failed");
  assert.equal(db.state.credit_purchases.length, 0);
  assert.equal(calls.length, 0);
});

test("a failed order insert says no money moved and leaves the provider untouched", async () => {
  const db = createDb();
  db.state.failInsert = { message: "relation credit_purchases does not exist" };
  const { creditsBilling, prodamus } = loadModules(db);
  const calls = stubProvider(prodamus);

  await assert.rejects(
    () => creditsBilling.createCreditsPayment("buyer-1", { package_id: "pack_100" }, KEY),
    (error) => error.httpStatus === 500 && error.details && error.details.code === "payment_not_started"
  );
  assert.equal(db.state.requests.get("buyer-1:" + KEY).status, "failed");
  assert.equal(calls.length, 0, "no invoice may be created when the local order does not exist");
});

test("when the order reference cannot be attached, the local order is denied and the code says so", async () => {
  const db = createDb();
  db.state.failAttach = true;
  const { creditsBilling, prodamus } = loadModules(db);
  const calls = stubProvider(prodamus);

  await assert.rejects(
    () => creditsBilling.createCreditsPayment("buyer-1", { package_id: "pack_100" }, KEY),
    (error) => error.httpStatus === 503 && error.details && error.details.code === "payment_order_preparation_failed"
  );
  const purchase = db.state.credit_purchases[0];
  assert.equal(purchase.status, "denied", "the unsent order must not stay pending");
  assert.equal(purchase.balance_credited_at, undefined, "nothing may be credited");
  assert.equal(calls.length, 0, "nothing may be sent to the provider");
});

test("an ambiguous provider failure blocks a second invoice until reconciliation", async () => {
  const db = createDb();
  const { creditsBilling, prodamus } = loadModules(db);
  stubProvider(prodamus, { error: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) });

  await assert.rejects(() => creditsBilling.createCreditsPayment("buyer-1", { package_id: "pack_100" }, KEY));
  assert.equal(db.state.requests.get("buyer-1:" + KEY).status, "unknown",
    "a provider outcome we cannot read must never be treated as 'nothing happened'");

  // The retry tells the customer to wait for reconciliation instead of paying twice.
  await assert.rejects(
    () => creditsBilling.createCreditsPayment("buyer-1", { package_id: "pack_100" }, KEY),
    (error) => error.httpStatus === 409 && error.details && error.details.code === "payment_outcome_unknown"
  );
});

test("an invoice whose link cannot be stored says exactly that, with a code", async () => {
  const db = createDb();
  db.state.failComplete = true;
  const { creditsBilling, prodamus } = loadModules(db);
  stubProvider(prodamus);

  await assert.rejects(
    () => creditsBilling.createCreditsPayment("buyer-1", { package_id: "pack_100" }, KEY),
    (error) => error.httpStatus === 503 && error.details && error.details.code === "payment_link_not_saved"
  );
  assert.equal(db.state.requests.get("buyer-1:" + KEY).status, "unknown");
});

test("the purchase history is scoped to the customer and reports a missing migration", async () => {
  const db = createDb();
  db.state.credit_purchases.push(
    { id: "p1", user_id: "buyer-1", package_id: "pack_100", credits: 100, amount: 190, status: "success", currency: "rub" },
    { id: "p2", user_id: "someone-else", package_id: "pack_500", credits: 500, amount: 790, status: "success", currency: "rub" }
  );
  const { creditsBilling } = loadModules(db);

  const rows = await creditsBilling.listUserCreditPurchases("buyer-1");
  assert.deepEqual(rows.map((row) => row.id), ["p1"], "one customer must never see another customer's purchases");

  const brokenDb = createDb();
  brokenDb.from = (table) => {
    if (table !== "credit_purchases") return createDb().from(table);
    const builder = { select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
      then: (resolve) => resolve({ data: null, error: { message: "relation does not exist" } }) };
    return builder;
  };
  const broken = loadModules(brokenDb);
  await assert.rejects(() => broken.creditsBilling.listUserCreditPurchases("buyer-1"),
    (error) => error.httpStatus === 500 && /миграцию 007/.test(error.message));
});

test("a webhook URL that the provider would reject stops the request before the key is burned", async () => {
  // PRODAMUS_SYS makes the provider echo callbacks; an http:// or credential-bearing URL would be
  // accepted by us and rejected by them, so the invoice would be created with no usable callback.
  const db = createDb();
  const { creditsBilling, prodamus } = loadModules(db);
  const calls = stubProvider(prodamus);
  const previous = process.env.PRODAMUS_SYS;
  const previousBase = process.env.PUBLIC_BACKEND_URL;
  process.env.PRODAMUS_SYS = "pinposy";
  process.env.PUBLIC_BACKEND_URL = "http://insecure.pinposy.test";
  try {
    await assert.rejects(
      () => creditsBilling.createCreditsPayment("buyer-1", { package_id: "pack_100" }, KEY),
      (error) => error.httpStatus === 500 && /urlNotification/.test(error.message)
    );
  } finally {
    if (previous === undefined) delete process.env.PRODAMUS_SYS; else process.env.PRODAMUS_SYS = previous;
    process.env.PUBLIC_BACKEND_URL = previousBase;
  }
  assert.equal(db.state.requests.size, 0, "the idempotency key must not be reserved for a request we cannot honour");
  assert.equal(db.state.credit_purchases.length, 0);
  assert.equal(calls.length, 0);
});

test("if the local order cannot even be denied, the request is parked for reconciliation", async () => {
  const db = createDb();
  db.state.failAttach = true;
  const { creditsBilling, prodamus } = loadModules(db);
  stubProvider(prodamus);
  // The write that would deny the unsent order fails, so the truth about this order is unknown.
  const realUpdate = db.from;
  db.from = (table) => {
    if (table !== "credit_purchases") return realUpdate(table);
    const builder = { update: () => builder, eq: () => builder, select: () => builder,
      maybeSingle: async () => ({ data: null, error: { message: "update failed" } }) };
    const current = realUpdate(table);
    return Object.assign(builder, { insert: current.insert, select: current.select });
  };

  await assert.rejects(
    () => creditsBilling.createCreditsPayment("buyer-1", { package_id: "pack_100" }, KEY),
    (error) => error.httpStatus === 503 && error.details && error.details.code === "payment_order_preparation_failed"
  );
  assert.equal(db.state.requests.get("buyer-1:" + KEY).status, "unknown",
    "an order that could not be cleaned up must block a retry until someone looks");
});
