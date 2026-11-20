"use strict";

const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");

/**
 * The subscription purchase path (billing.js createPayment) is the twin of the credit-pack path,
 * and it had the same gap: no direct test. Writing them found a real hole.
 *
 * `PLANS` is a plain object literal, so `if (!PLANS[plan])` accepted every member of
 * Object.prototype: a request with `plan: "constructor"` passed validation with
 * `PLANS["constructor"].rub` undefined. The subscription row was then inserted with the column
 * default `amount = 0` (numeric not null default 0), the provider refused the zero amount, and
 * because that refusal is not flagged as a provider rejection the idempotency request was parked
 * as `unknown` - the customer saw "reconciliation in progress" for a plan that simply does not
 * exist, and the owner had to resolve it by hand.
 *
 * The checks below pin the fix and the rest of the money path: catalogue prices only, one invoice
 * per idempotency key, and a failure that is either retryable or parked, never silently lost.
 */

process.env.PRODAMUS_SHOP_ID = "pinposy";
process.env.PRODAMUS_SECRET = "unit-test-secret";
process.env.PRODAMUS_DEMO = "1";
process.env.PUBLIC_BACKEND_URL = "https://api.pinposy.test";
process.env.FRONTEND_URL = "https://pinposy.test";

const { PLANS } = require("../billing");

function createDb() {
  const state = {
    users: [{ id: "buyer-1", email: "buyer@example.invalid" }],
    subscriptions: [],
    requests: new Map(),
    calls: { insert: 0 },
    failInsert: null,
    failAttach: false,
    failComplete: false,
    failUpdate: false,
  };

  function from(table) {
    const filter = {};
    let operation = "select";
    let payload = null;
    let updating = null;
    let ordering = null;
    let rowLimit = null;
    const builder = {
      select() { return builder; },
      insert(row) { operation = "insert"; payload = row; return builder; },
      update(row) { operation = "update"; updating = row; return builder; },
      eq(column, value) { filter[column] = value; return builder; },
      in(column, values) { filter[column] = values; return builder; },
      order(column, options) { ordering = { column, ascending: !options || options.ascending !== false }; return builder; },
      limit(count) { rowLimit = count; return builder; },
      maybeSingle() { return finish(); },
      single() { return finish(); },
      then(resolve, reject) { return finish().then(resolve, reject); },
    };

    function finish() {
      if (operation === "insert") {
        state.calls.insert += 1;
        if (state.failInsert) return Promise.resolve({ data: null, error: state.failInsert });
        const row = { id: `sub-${state.subscriptions.length + 1}`, ...payload };
        state.subscriptions.push(row);
        return Promise.resolve({ data: row, error: null });
      }
      if (operation === "update") {
        if (state.failUpdate) return Promise.resolve({ data: null, error: { message: "update failed" } });
        let matched = null;
        for (const row of state.subscriptions) {
          if (Object.entries(filter).every(([key, value]) => row[key] === value)) matched = row;
        }
        if (matched) Object.assign(matched, updating);
        return Promise.resolve({ data: matched ? { id: matched.id } : null, error: null });
      }
      if (table === "users") {
        const row = state.users.find((candidate) => candidate.id === filter.id) || null;
        if (row) return Promise.resolve({ data: row, error: null });
        if (Array.isArray(filter.id)) {
          const rows = state.users.filter((candidate) => filter.id.includes(candidate.id));
          return Promise.resolve({ data: rows, error: null });
        }
        return Promise.resolve({ data: null, error: { message: "no rows" } });
      }
      let rows = state.subscriptions.filter((row) =>
        Object.entries(filter).every(([key, value]) => (Array.isArray(value) ? value.includes(row[key]) : row[key] === value))
      );
      if (ordering) {
        rows = [...rows].sort((left, right) => {
          const a = String(left[ordering.column] ?? "");
          const b = String(right[ordering.column] ?? "");
          return ordering.ascending ? a.localeCompare(b) : b.localeCompare(a);
        });
      }
      if (rowLimit != null) rows = rows.slice(0, rowLimit);
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
    if (!existing) return Promise.resolve({ data: true, error: null });
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

function loadBilling(db) {
  const supabasePath = require.resolve("../supabase");
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: db };
  for (const relative of ["../billing", "../paymentCreationIdempotency", "../prodamus"]) {
    delete require.cache[require.resolve(relative)];
  }
  const billing = require("../billing");
  const prodamus = require("../prodamus");
  const calls = [];
  prodamus.createPaymentLink = async (request) => {
    calls.push(request);
    if (request.error) throw request.error;
    return { url: `https://pay.prodamus.test/${request.orderId}`, orderId: request.orderId };
  };
  prodamus.isConfigured = () => true;
  return { billing, prodamus, calls };
}

const KEY = "subscription-purchase-key-0001";

test("a plan that only exists on Object.prototype is refused, not turned into a zero-amount order", async () => {
  // This is the defect the suite was written to catch: `!PLANS[plan]` accepted every inherited
  // member, inserted a subscription whose amount fell back to the column default 0, had the
  // provider refuse it, and parked the customer's idempotency request as unknown.
  const db = createDb();
  const { billing, calls } = loadBilling(db);

  for (const plan of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty", "pack_100", "none", ""]) {
    await assert.rejects(
      () => billing.createPayment("buyer-1", { plan }, KEY),
      (error) => error.httpStatus === 422,
      `plan ${JSON.stringify(plan)} must be refused with 422`
    );
  }

  assert.equal(db.state.subscriptions.length, 0, "no order may be created for an unknown plan");
  assert.equal(db.state.requests.size, 0, "an unknown plan must not burn an idempotency key");
  assert.equal(calls.length, 0, "the provider must not be called for an unknown plan");
});

test("the amount comes from the plan catalogue in the requested currency", async () => {
  const db = createDb();
  const { billing, calls } = loadBilling(db);

  const rub = await billing.createPayment("buyer-1", { plan: "pro", currency: "rub", amount: 1 }, "subscription-key-rub-0001");
  assert.equal(rub.amount, PLANS.pro.rub);
  assert.equal(db.state.subscriptions[0].amount, PLANS.pro.rub);
  assert.equal(calls[0].amount, PLANS.pro.rub);
  assert.equal(calls[0].currency, "rub");

  const usd = await billing.createPayment("buyer-1", { plan: "pro", currency: "usd" }, "subscription-key-usd-0001");
  assert.equal(usd.amount, PLANS.pro.usd);
  assert.equal(usd.currency, "usd");
  assert.equal(db.state.subscriptions[1].amount, PLANS.pro.usd);
});

test("an unsupported currency is refused before any work", async () => {
  const db = createDb();
  const { billing, calls } = loadBilling(db);
  for (const currency of ["eur", "gbp", "RUB1", 5, {}]) {
    await assert.rejects(() => billing.createPayment("buyer-1", { plan: "start", currency }, KEY),
      (error) => error.httpStatus === 422, `currency ${JSON.stringify(currency)} must be refused`);
  }
  assert.equal(db.state.requests.size, 0);
  assert.equal(calls.length, 0);
});

test("one idempotency key creates one subscription invoice and the replay returns the same link", async () => {
  const db = createDb();
  const { billing, calls } = loadBilling(db);

  const first = await billing.createPayment("buyer-1", { plan: "start" }, KEY);
  const replay = await billing.createPayment("buyer-1", { plan: "start" }, KEY);
  assert.equal(calls.length, 1);
  assert.equal(db.state.subscriptions.length, 1);
  assert.equal(replay.order_id, first.order_id);
  assert.equal(replay.payment_url, first.payment_url);

  await assert.rejects(() => billing.createPayment("buyer-1", { plan: "agency" }, KEY),
    (error) => error.httpStatus === 409 && error.details.code === "idempotency_key_reused");
  assert.equal(calls.length, 1);
});

test("an unknown user, a failed insert and a failed link storage each leave a clear state", async () => {
  const missing = createDb();
  const first = loadBilling(missing);
  await assert.rejects(() => first.billing.createPayment("ghost", { plan: "start" }, KEY),
    (error) => error.httpStatus === 404);
  assert.equal(missing.state.requests.get(`ghost:${KEY}`).status, "failed", "the customer must be able to retry");

  const broken = createDb();
  broken.state.failInsert = { message: "relation subscriptions does not exist" };
  const second = loadBilling(broken);
  await assert.rejects(() => second.billing.createPayment("buyer-1", { plan: "start" }, KEY),
    // Section 112: the customer cannot read "миграция 006" and the important fact is that no money
    // moved, so the answer carries a code the client can say in the customer's own language.
    (error) => error.httpStatus === 500 && error.details && error.details.code === "payment_not_started");
  assert.equal(broken.state.requests.get(`buyer-1:${KEY}`).status, "failed");
  assert.equal(second.calls.length, 0);

  const unsaved = createDb();
  unsaved.state.failComplete = true;
  const third = loadBilling(unsaved);
  await assert.rejects(() => third.billing.createPayment("buyer-1", { plan: "start" }, KEY),
    (error) => error.httpStatus === 503 && error.details.code === "payment_link_not_saved");
  assert.equal(unsaved.state.requests.get(`buyer-1:${KEY}`).status, "unknown",
    "an invoice exists at the provider, so a retry must not create another");
});

test("an unattachable order reference denies the local order and never calls the provider", async () => {
  const db = createDb();
  db.state.failAttach = true;
  const { billing, calls } = loadBilling(db);
  await assert.rejects(() => billing.createPayment("buyer-1", { plan: "start" }, KEY),
    (error) => error.httpStatus === 503 && error.details.code === "payment_order_preparation_failed");
  assert.equal(db.state.subscriptions[0].status, "denied");
  assert.equal(calls.length, 0);
});

test("an order that cannot be denied either is parked for reconciliation", async () => {
  const db = createDb();
  db.state.failAttach = true;
  db.state.failUpdate = true;
  const { billing, calls } = loadBilling(db);
  await assert.rejects(() => billing.createPayment("buyer-1", { plan: "start" }, KEY),
    (error) => error.httpStatus === 503);
  assert.equal(db.state.requests.get(`buyer-1:${KEY}`).status, "unknown");
  assert.equal(calls.length, 0);
});

test("an unreadable provider outcome blocks the retry instead of duplicating the invoice", async () => {
  const db = createDb();
  const { billing, prodamus } = loadBilling(db);
  prodamus.createPaymentLink = async () => {
    throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
  };
  await assert.rejects(() => billing.createPayment("buyer-1", { plan: "start" }, KEY));
  assert.equal(db.state.requests.get(`buyer-1:${KEY}`).status, "unknown");
  await assert.rejects(() => billing.createPayment("buyer-1", { plan: "start" }, KEY),
    (error) => error.httpStatus === 409 && error.details.code === "payment_outcome_unknown");
});

test("an invoice the provider rejects outright releases the order and the key", async () => {
  const db = createDb();
  const { billing, prodamus } = loadBilling(db);
  prodamus.createPaymentLink = async () => {
    throw Object.assign(new Error("provider refused the invoice"), { providerRejected: true });
  };
  await assert.rejects(() => billing.createPayment("buyer-1", { plan: "start" }, KEY));
  assert.equal(db.state.subscriptions[0].status, "denied", "nothing reached the provider, so nothing may stay pending");
  assert.equal(db.state.requests.get(`buyer-1:${KEY}`).status, "failed", "the customer may try again");
});

test("the plan catalogue served to the UI carries both currencies from one source", async () => {
  const db = createDb();
  const { billing } = loadBilling(db);
  const catalog = billing.planCatalog();
  assert.deepEqual(catalog.map((entry) => entry.id), ["analytics", "start", "pro", "agency"]);
  for (const entry of catalog) {
    assert.equal(entry.amount.rub, PLANS[entry.id].rub);
    assert.equal(entry.amount.usd, PLANS[entry.id].usd);
    assert.ok(entry.title && entry.title.trim(), `${entry.id} must have a human title`);
  }
});

test("a customer sees only their own subscriptions; the admin list is clamped and joined", async () => {
  const db = createDb();
  db.state.users.push({ id: "buyer-2", email: "other@example.invalid" });
  db.state.subscriptions.push(
    { id: "s1", user_id: "buyer-1", plan: "start", status: "success", amount: 1990, currency: "rub", created_at: "2026-01-01" },
    { id: "s2", user_id: "buyer-2", plan: "pro", status: "pending", amount: 4990, currency: "rub", created_at: "2026-01-02" },
    { id: "s3", user_id: "buyer-1", plan: "agency", status: "pending", amount: 12990, currency: "rub", created_at: "2026-01-03" }
  );
  const { billing } = loadBilling(db);

  const mine = await billing.listUserSubscriptions("buyer-1");
  assert.deepEqual(mine.map((row) => row.id).sort(), ["s1", "s3"],
    "one customer must never see another customer's subscriptions");

  const newestTwo = await billing.listAllSubscriptions(2);
  assert.equal(newestTwo.subscriptions.length, 2, "the admin limit must be honoured");
  assert.deepEqual(newestTwo.subscriptions.map((row) => row.id), ["s3", "s2"], "newest first");

  const everything = await billing.listAllSubscriptions(50);
  assert.equal(everything.subscriptions.length, 3);
  assert.equal(everything.subscriptions[0].email, "buyer@example.invalid", "the admin view joins the email");
  assert.equal(everything.subscriptions[1].email, "other@example.invalid");
  assert.equal(everything.totals.paidCount, 1);
  assert.equal(everything.totals.pendingCount, 2);
  assert.equal(everything.totals.paidAmount, 1990, "only paid subscriptions count towards the revenue total");

  assert.equal(billing.normalizeAdminSubscriptionLimit("abc"), 100, "garbage falls back to the default");
  assert.equal(billing.normalizeAdminSubscriptionLimit(-5), 1, "the limit has a floor");
  assert.equal(billing.normalizeAdminSubscriptionLimit(100000), 500, "the limit has a ceiling");
  assert.equal(billing.normalizeAdminSubscriptionLimit(7), 7);
});
