const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { parseMultipartFields } = require("../prodamusWebhookBody");
const prodamus = require("../prodamus");

test("parses nested product fields from multipart field names", () => {
  assert.deepEqual(
    parseMultipartFields({
      order_id: "pp-start-123",
      payment_status: "success",
      sum: "1990.00",
      "products[0][name]": "PinPosy / Старт",
      "products[0][price]": "1990.00",
      "products[0][quantity]": "1",
    }),
    {
      order_id: "pp-start-123",
      payment_status: "success",
      sum: "1990.00",
      products: [{ name: "PinPosy / Старт", price: "1990.00", quantity: "1" }],
    }
  );
});

test("rejects prototype-polluting and conflicting multipart fields", () => {
  assert.throws(() => parseMultipartFields({ "[__proto__][polluted]": "yes" }));
  assert.throws(() => parseMultipartFields({ order_id: "x", "order_id[child]": "y" }));
});

test("rejects malformed multipart field names", () => {
  for (const field of ["order_id]suffix", "products[0]suffix", "products[[0]]", "products[]"]) {
    assert.throws(() => parseMultipartFields({ [field]: "x" }));
  }
});

test("rejects oversized sparse array indexes before signature serialization", () => {
  assert.throws(() => parseMultipartFields({ "products[999999999][name]": "x" }), /out of range/);
  assert.throws(() => parseMultipartFields({ "products[80][name]": "x" }), /out of range/);
});

test("rejects non-numeric keys inside multipart arrays", () => {
  assert.throws(() => parseMultipartFields({
    "products[0][name]": "PinPosy",
    "products[name]": "conflicting structure",
  }), /numeric indexes/);
});

test("bounds nested arrays and multipart field depth", () => {
  assert.throws(() => parseMultipartFields({
    "products[0][variants][0][options][0][name]": "x",
  }), /Invalid multipart field name/);
  assert.throws(() => parseMultipartFields({
    "a[b][c][d][e][f][g][h][i]": "x",
  }), /Invalid multipart field name/);
});

test("encodes nested Prodamus product fields as bracketed form keys", () => {
  const encoded = prodamus.toFormEncoded({
    do: "link",
    order_id: "pp-start-123",
    products: [{
      name: "PinPosy / Старт",
      price: "1990.00",
      quantity: "1",
      sku: "start",
      tax: { tax_type: 0 },
    }],
  });
  const form = new URLSearchParams(encoded);
  assert.equal(form.get("products[0][name]"), "PinPosy / Старт");
  assert.equal(form.get("products[0][price]"), "1990.00");
  assert.equal(form.get("products[0][quantity]"), "1");
  assert.equal(form.get("products[0][sku]"), "start");
  assert.equal(form.get("products[0][tax][tax_type]"), "0");
  assert.equal(form.get("order_id"), "pp-start-123");
  assert.equal(encoded.includes("[object Object]"), false);
  assert.equal(form.has("products"), false);
});

test("uses the configured Prodamus shop ID when no explicit form URL is set", () => {
  const previousUrl = process.env.PRODAMUS_URL;
  const previousShop = process.env.PRODAMUS_SHOP_ID;
  try {
    delete process.env.PRODAMUS_URL;
    process.env.PRODAMUS_SHOP_ID = "pinposy-test";
    assert.equal(prodamus.baseUrl(), "https://pinposy-test.payform.ru/");
  } finally {
    if (previousUrl === undefined) delete process.env.PRODAMUS_URL;
    else process.env.PRODAMUS_URL = previousUrl;
    if (previousShop === undefined) delete process.env.PRODAMUS_SHOP_ID;
    else process.env.PRODAMUS_SHOP_ID = previousShop;
  }
});

test("accepts secure checkout URLs and rejects unsafe or malformed ones", () => {
  assert.equal(
    prodamus.validateCheckoutUrl("https://shop.payform.ru/pay?id=123"),
    "https://shop.payform.ru/pay?id=123"
  );
  for (const url of [
    "http://shop.payform.ru/pay",
    "javascript:alert(1)",
    "https://user:pass@shop.payform.ru/pay",
    "https://evil.example/pay",
    "https://payform.ru.evil.example/pay",
    "not a url",
    "",
  ]) {
    assert.throws(() => prodamus.validateCheckoutUrl(url), (error) => error.httpStatus === 502);
  }
});

test("always sends the required empty SYS field for a self-written integration", async () => {
  const previous = {
    PRODAMUS_SECRET: process.env.PRODAMUS_SECRET,
    PRODAMUS_OFFLINE: process.env.PRODAMUS_OFFLINE,
    PRODAMUS_URL: process.env.PRODAMUS_URL,
    PRODAMUS_SYS: process.env.PRODAMUS_SYS,
  };
  try {
    process.env.PRODAMUS_SECRET = "shop-secret-test";
    process.env.PRODAMUS_OFFLINE = "1";
    process.env.PRODAMUS_URL = "https://example.payform.ru/";
    // Whitespace-only configuration must behave like an unset SYS code.
    process.env.PRODAMUS_SYS = "   ";
    const result = await prodamus.createPaymentLink({
      orderId: "pp-start-test",
      amount: 1990,
      description: "PinPosy / Старт",
      urlNotification: "https://api.pinposy.com/billing/webhook",
      urlSuccess: "https://pinposy.com/app?payment=success",
    });
    const params = new URL(result.url).searchParams;
    assert.equal(params.get("sys"), "");
    assert.equal(params.has("urlNotification"), false);
    assert.equal(params.get("urlSuccess"), "https://pinposy.com/app?payment=success");
    assert.equal(params.get("products[0][name]"), "PinPosy / Старт");
    assert.match(params.get("signature") || "", /^[a-f0-9]{64}$/);
    const { signature, ...unsignedPayload } = result.payload;
    assert.equal(signature, prodamus.signPayload(unsignedPayload));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("uses the amount and currency from the signed Prodamus callback", () => {
  assert.deepEqual(
    prodamus.getWebhookPaymentAmount({ sum: "1990.00" }, "rub"),
    { ok: true, amount: 1990, currency: "rub", amountField: "sum" }
  );
  assert.deepEqual(
    prodamus.getWebhookPaymentAmount({
      sum: "3100.00", currency: "usd", currency_sum: "24.00",
    }, "usd"),
    { ok: true, amount: 24, currency: "usd", amountField: "currency_sum" }
  );
  assert.equal(
    prodamus.getWebhookPaymentAmount({ sum: "24.00", currency: "rub" }, "usd").reason,
    "currency_mismatch"
  );
  assert.equal(
    prodamus.getWebhookPaymentAmount({ sum: "24.00" }, "usd").reason,
    "currency_missing"
  );
  assert.equal(
    prodamus.getWebhookPaymentAmount({ currency: "usd", currency_sum: "24.00" }, "usd").ok,
    true
  );
  assert.equal(
    prodamus.getWebhookPaymentAmount({ currency: "usd", sum: "24.00" }, "usd").reason,
    "amount_missing"
  );
});

test("normalizes only documented final Prodamus webhook statuses", () => {
  assert.equal(prodamus.normalizePaymentStatus("success"), "success");
  assert.equal(prodamus.normalizePaymentStatus("order_canceled"), "canceled");
  assert.equal(prodamus.normalizePaymentStatus("order_denied"), "denied");
  assert.equal(prodamus.normalizePaymentStatus("processing"), null);
  assert.equal(prodamus.normalizePaymentStatus(""), null);
  assert.equal(prodamus.normalizePaymentStatus("unknown_future_status"), null);
});

test("canonicalizes nested objects recursively and escapes forward slashes", () => {
  const payload = {
    products: [{ price: 1990, name: "PinPosy / Start", tax: { type: 0, code: "x" } }],
    order_id: 123,
  };
  assert.equal(
    prodamus.canonicalString(payload),
    '{"order_id":"123","products":[{"name":"PinPosy \\/ Start","price":"1990","tax":{"code":"x","type":"0"}}]}'
  );
});

test("verifies Prodamus signatures for nested multipart payloads", () => {
  const secret = "webhook-secret-test";
  process.env.PRODAMUS_SECRET_WEBHOOK = secret;
  const payload = {
    order_id: "pp-start-123",
    payment_status: "success",
    sum: "1990.00",
    products: [{ name: "PinPosy / Start", price: "1990.00", quantity: "1" }],
  };
  const signature = crypto.createHmac("sha256", secret)
    .update(prodamus.canonicalString(payload), "utf8").digest("hex");
  assert.deepEqual(prodamus.verifyWebhook(payload, { sign: signature }), { ok: true });
});

test("outgoing payment links use the shop secret, not the webhook secret", () => {
  process.env.PRODAMUS_SECRET = "shop-secret-test";
  process.env.PRODAMUS_SECRET_WEBHOOK = "different-webhook-secret";
  const payload = { order_id: "order-123", sum: "1990.00" };
  const expected = crypto.createHmac("sha256", process.env.PRODAMUS_SECRET)
    .update(prodamus.canonicalString(payload), "utf8").digest("hex");
  assert.equal(prodamus.signPayload(payload), expected);
});

function createWebhookResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function signedWebhook(body) {
  const secret = "webhook-http-test-secret";
  process.env.PRODAMUS_SECRET_WEBHOOK = secret;
  const signature = crypto.createHmac("sha256", secret)
    .update(prodamus.canonicalString(body), "utf8").digest("hex");
  return { body, headers: { sign: signature } };
}

function createPaymentDb({ subscription, purchase, activate, credit, settle, cancel }) {
  const state = { subscription: structuredClone(subscription), purchase: structuredClone(purchase) };
  const rpcCalls = { activate: 0, credit: 0, settle: 0 };
  const db = {
    from(table) {
      const key = table === "subscriptions" ? "subscription" : "purchase";
      const row = state[key];
      const query = {
        select() { return this; },
        eq(column, value) { this.filter = [column, value]; return this; },
        // Regular function, not an arrow: `this` must be the query object, not the db.
        async maybeSingle() {
          return { data: row && row[this.filter[0]] === this.filter[1] ? structuredClone(row) : null, error: null };
        },
        update(values) {
          this.values = values;
          return this;
        },
        is() { return this; },
        neq(column, value) {
          this.neqFilter = [column, value];
          return this;
        },
        then(resolve, reject) {
          if (row && (!this.filter || row[this.filter[0]] === this.filter[1]) &&
              (!this.neqFilter || row[this.neqFilter[0]] !== this.neqFilter[1]) &&
              (!this.isFilter || row[this.isFilter[0]] === this.isFilter[1])) {
            Object.assign(row, this.values);
          }
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      const originalIs = query.is;
      query.is = function(column, value) { this.isFilter = [column, value]; return originalIs.call(this); };
      return query;
    },
    async rpc(name, args) {
      if (name === "activate_paid_subscription") {
        rpcCalls.activate++;
        return activate(state, args, rpcCalls);
      }
      if (name === "credit_paid_purchase") {
        rpcCalls.credit++;
        return credit(state, args, rpcCalls);
      }
      if (name === "settle_payment_creation_request") {
        rpcCalls.settle++;
        if (settle) return settle(state, args, rpcCalls);
        const kind = args.p_request_kind;
        const row = kind === "subscription" ? state.subscription
          : kind === "credits" ? state.purchase
            : null;
        if (!row || row.id !== args.p_local_payment_id ||
            row.provider_payment_id !== args.p_order_id ||
            row.status !== "success" ||
            (kind === "subscription" &&
              (!row.period_start || !row.period_end ||
                new Date(row.period_end) <= new Date(row.period_start))) ||
            (kind === "credits" && !row.balance_credited_at)) {
          return { data: null, error: { message: "local payment is not exactly fulfilled for checkout request" } };
        }
        return { data: true, error: null };
      }
      throw new Error("unexpected RPC " + name);
    },
    state,
    rpcCalls,
  };
  return db;
}

test("subscription webhook concurrent duplicate callbacks activate exactly once", async () => {
  const db = createPaymentDb({
    subscription: { id: "sub-1", provider_payment_id: "pp-sub-1", amount: 1990, currency: "rub", status: "pending" },
    activate: async (state, args, calls) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      if (state.subscription.status === "success") return { data: { plan: "start", current_plan: "start", period_end: "2027-01-01", already_activated: true }, error: null };
      state.subscription.status = "success";
      state.subscription.period_start = "2026-12-02T00:00:00.000Z";
      state.subscription.period_end = "2027-01-01T00:00:00.000Z";
      return { data: { plan: "start", current_plan: "start", period_end: "2027-01-01", already_activated: false }, error: null };
    },
    credit: async () => ({ data: 0, error: null }),
  });
  const body = { order_id: "pp-sub-1", payment_status: "success", sum: "1990.00", currency: "rub" };
  const req1 = signedWebhook(body), req2 = signedWebhook(body);
  const res1 = createWebhookResponse(), res2 = createWebhookResponse();
  await Promise.all([
    require("../billing").handleWebhook(req1, res1, { supabase: db, dispatchPendingSubscriptionEmails: async () => ({}) }),
    require("../billing").handleWebhook(req2, res2, { supabase: db, dispatchPendingSubscriptionEmails: async () => ({}) }),
  ]);
  assert.equal(db.rpcCalls.activate, 2);
  assert.equal(db.rpcCalls.settle, 2, "both committed duplicate callbacks must reconcile checkout state");
  assert.equal(db.state.subscription.status, "success");
  assert.equal(res1.statusCode, 200);
  assert.equal(res2.statusCode, 200);
  assert.equal([res1.body.idempotent, res2.body.idempotent].filter(Boolean).length, 1);
});

test("subscription webhook retries after commit-then-error and observes idempotent activation", async () => {
  let committed = false;
  const db = createPaymentDb({
    subscription: { id: "sub-2", provider_payment_id: "pp-sub-2", amount: 1990, currency: "rub", status: "pending" },
    activate: async (state) => {
      if (!committed) {
        committed = true;
        state.subscription.status = "success";
        state.subscription.period_start = "2026-12-02T00:00:00.000Z";
        state.subscription.period_end = "2027-01-01T00:00:00.000Z";
        return { data: null, error: { message: "connection lost after commit" } };
      }
      return { data: { plan: "start", current_plan: "start", period_end: "2027-01-01", already_activated: true }, error: null };
    },
    credit: async () => ({ data: 0, error: null }),
  });
  const req = signedWebhook({ order_id: "pp-sub-2", payment_status: "success", sum: "1990.00", currency: "rub" });
  const first = createWebhookResponse();
  await require("../billing").handleWebhook(req, first, { supabase: db, dispatchPendingSubscriptionEmails: async () => ({}) });
  assert.equal(first.statusCode, 500);
  const second = createWebhookResponse();
  await require("../billing").handleWebhook(req, second, { supabase: db, dispatchPendingSubscriptionEmails: async () => ({}) });
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.idempotent, true);
  assert.equal(db.rpcCalls.activate, 2);
  assert.equal(db.rpcCalls.settle, 1, "only the successful retry can settle the checkout");
});

test("subscription webhook retries checkout settlement after activation already committed", async () => {
  let settlementCommitted = false;
  const db = createPaymentDb({
    subscription: {
      id: "sub-settlement-retry",
      provider_payment_id: "pp-sub-settlement-retry",
      amount: 1990,
      currency: "rub",
      status: "pending",
    },
    activate: async (state) => {
      if (state.subscription.status !== "success") {
        state.subscription.status = "success";
        state.subscription.period_start = "2026-12-02T00:00:00.000Z";
        state.subscription.period_end = "2027-01-01T00:00:00.000Z";
      }
      return {
        data: {
          plan: "start",
          current_plan: "start",
          period_end: "2027-01-01",
          already_activated: settlementCommitted,
        },
        error: null,
      };
    },
    credit: async () => ({ data: 0, error: null }),
    settle: async () => {
      if (!settlementCommitted) {
        return { data: null, error: { message: "temporary settlement database failure" } };
      }
      return { data: true, error: null };
    },
  });
  const req = signedWebhook({
    order_id: "pp-sub-settlement-retry",
    payment_status: "success",
    sum: "1990.00",
    currency: "rub",
  });
  const first = createWebhookResponse();
  await require("../billing").handleWebhook(req, first, {
    supabase: db,
    dispatchPendingSubscriptionEmails: async () => ({}),
  });
  assert.equal(first.statusCode, 500);
  assert.equal(db.state.subscription.status, "success");
  assert.equal(db.rpcCalls.activate, 1);

  settlementCommitted = true;
  const second = createWebhookResponse();
  await require("../billing").handleWebhook(req, second, {
    supabase: db,
    dispatchPendingSubscriptionEmails: async () => ({}),
  });
  assert.equal(second.statusCode, 200);
  assert.equal(db.rpcCalls.activate, 2, "retry must observe the idempotently activated subscription");
  assert.equal(db.rpcCalls.settle, 2);
});

test("subscription webhook amount mismatch is audited and never activates the plan", async () => {
  const db = createPaymentDb({
    subscription: {
      id: "sub-amount-mismatch",
      provider_payment_id: "pp-sub-amount-mismatch",
      amount: 1990,
      currency: "rub",
      status: "pending",
    },
    activate: async () => {
      throw new Error("a mismatched payment must never activate a subscription");
    },
    credit: async () => ({ data: 0, error: null }),
  });
  const auditRecords = [];
  const auditedDb = {
    ...db,
    from(table) {
      if (table === "billing_webhook_exceptions") {
        return {
          insert: async (record) => {
            auditRecords.push(record);
            return { error: null };
          },
        };
      }
      return db.from(table);
    },
  };

  const response = createWebhookResponse();
  await require("../billing").handleWebhook(
    signedWebhook({
      order_id: "pp-sub-amount-mismatch",
      payment_status: "success",
      sum: "1989.00",
      currency: "rub",
    }),
    response,
    { supabase: auditedDb, dispatchPendingSubscriptionEmails: async () => ({}) }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ignored, "amount mismatch");
  assert.equal(response.body.review_required, true);
  assert.equal(db.state.subscription.status, "denied");
  assert.equal(db.rpcCalls.activate, 0);
  assert.equal(auditRecords.length, 1);
  assert.equal(auditRecords[0].reason, "amount_mismatch");
  assert.equal(auditRecords[0].expected_amount, 1990);
});

test("credit webhook concurrent duplicate callbacks credit once; retry after ambiguous commit is idempotent", async () => {
  let committed = false;
  let actualCreditsApplied = 0;
  const db = createPaymentDb({
    purchase: { id: "purchase-1", provider_payment_id: "ppc-1", amount: 490, currency: "rub", credits: 100, package_id: "pack_100", balance_credited_at: null, status: "pending" },
    activate: async () => ({ data: null, error: null }),
    credit: async (state) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      if (state.purchase.balance_credited_at) return { data: 100, error: null };
      if (!committed) {
        committed = true;
        actualCreditsApplied++;
        state.purchase.balance_credited_at = "2026-11-07T00:00:00.000Z";
        state.purchase.status = "success";
        return { data: 100, error: { message: "connection lost after commit" } };
      }
      actualCreditsApplied++;
      return { data: 100, error: null };
    },
  });
  const body = { order_id: "ppc-1", payment_status: "success", sum: "490.00", currency: "rub" };
  const handler = require("../creditsBilling").handleCreditsWebhook;
  const first = createWebhookResponse(), second = createWebhookResponse();
  await Promise.all([
    handler(signedWebhook(body), first, { supabase: db }),
    handler(signedWebhook(body), second, { supabase: db }),
  ]);
  assert.equal(db.state.purchase.balance_credited_at !== null, true);
  assert.equal(actualCreditsApplied, 1, "duplicate callbacks must apply the credit only once");
  assert.equal(db.rpcCalls.credit, 2);
  const retry = createWebhookResponse();
  await handler(signedWebhook(body), retry, { supabase: db });
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.idempotent, true);
  assert.equal(db.rpcCalls.credit, 2);
  assert.equal(db.rpcCalls.settle, 2, "successful fulfillment and its duplicate must reconcile checkout state");
});

test("credit webhook retries checkout settlement without crediting twice", async () => {
  let settlementCommitted = false;
  let creditsApplied = 0;
  const db = createPaymentDb({
    purchase: {
      id: "purchase-settlement-retry",
      provider_payment_id: "ppc-settlement-retry",
      amount: 490,
      currency: "rub",
      credits: 100,
      package_id: "pack_100",
      balance_credited_at: null,
      status: "pending",
    },
    activate: async () => ({ data: null, error: null }),
    credit: async (state) => {
      if (!state.purchase.balance_credited_at) {
        creditsApplied += 1;
        state.purchase.balance_credited_at = "2026-11-07T00:00:00.000Z";
        state.purchase.status = "success";
      }
      return { data: 100, error: null };
    },
    settle: async () => {
      if (!settlementCommitted) {
        return { data: null, error: { message: "temporary settlement database failure" } };
      }
      return { data: true, error: null };
    },
  });
  const req = signedWebhook({
    order_id: "ppc-settlement-retry",
    payment_status: "success",
    sum: "490.00",
    currency: "rub",
  });
  const handler = require("../creditsBilling").handleCreditsWebhook;
  const first = createWebhookResponse();
  await handler(req, first, { supabase: db });
  assert.equal(first.statusCode, 500);
  assert.equal(db.state.purchase.balance_credited_at !== null, true);
  assert.equal(creditsApplied, 1);

  settlementCommitted = true;
  const second = createWebhookResponse();
  await handler(req, second, { supabase: db });
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.idempotent, true);
  assert.equal(creditsApplied, 1, "retry must not apply the credit package twice");
  assert.equal(db.rpcCalls.credit, 1);
  assert.equal(db.rpcCalls.settle, 2);
});

test("credit cancel racing after success cannot overwrite credited purchase", async () => {
  const db = createPaymentDb({
    purchase: { id: "purchase-2", provider_payment_id: "ppc-2", amount: 490, currency: "rub", credits: 100, package_id: "pack_100", balance_credited_at: "2026-11-07T00:00:00.000Z", status: "success" },
    activate: async () => ({ data: null, error: null }),
    credit: async () => ({ data: 100, error: null }),
  });
  const handler = require("../creditsBilling").handleCreditsWebhook;
  const response = createWebhookResponse();
  await handler(signedWebhook({ order_id: "ppc-2", payment_status: "order_canceled", sum: "490.00", currency: "rub" }), response, { supabase: db });
  assert.equal(response.statusCode, 200);
  assert.equal(db.state.purchase.status, "success");
  assert.equal(db.state.purchase.balance_credited_at, "2026-11-07T00:00:00.000Z");
});

test("credited purchase still audits a later signed success callback with a mismatched amount", async () => {
  const db = createPaymentDb({
    purchase: {
      id: "purchase-already-credited",
      provider_payment_id: "ppc-already-credited",
      amount: 490,
      currency: "rub",
      credits: 100,
      package_id: "pack_100",
      balance_credited_at: "2026-11-07T00:00:00.000Z",
      status: "success",
    },
    activate: async () => ({ data: null, error: null }),
    credit: async () => {
      throw new Error("an already-credited purchase must not call fulfillment for a mismatched event");
    },
  });
  const auditRecords = [];
  const auditedDb = {
    ...db,
    from(table) {
      if (table === "billing_webhook_exceptions") {
        return {
          insert: async (record) => {
            auditRecords.push(record);
            return { error: null };
          },
        };
      }
      return db.from(table);
    },
  };

  const response = createWebhookResponse();
  await require("../creditsBilling").handleCreditsWebhook(
    signedWebhook({
      order_id: "ppc-already-credited",
      payment_status: "success",
      sum: "489.00",
      currency: "rub",
    }),
    response,
    { supabase: auditedDb }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ignored, "amount mismatch");
  assert.equal(response.body.review_required, true);
  assert.equal(db.state.purchase.status, "success");
  assert.equal(db.state.purchase.balance_credited_at, "2026-11-07T00:00:00.000Z");
  assert.equal(db.rpcCalls.credit, 0);
  assert.equal(auditRecords.length, 1);
  assert.equal(auditRecords[0].reason, "amount_mismatch");
  assert.equal(auditRecords[0].expected_amount, 490);
});

test("subscription cancel callback after successful activation cannot downgrade the paid plan", async () => {
  const db = createPaymentDb({
    subscription: { id: "sub-cancel-race", provider_payment_id: "pp-sub-cancel-race", amount: 1990, currency: "rub", status: "success", period_start: "2026-12-02T00:00:00.000Z", period_end: "2027-01-01T00:00:00.000Z" },
    activate: async () => ({ data: { plan: "start", current_plan: "start", period_end: "2027-01-01", already_activated: true }, error: null }),
    credit: async () => ({ data: 0, error: null }),
  });
  const response = createWebhookResponse();
  await require("../billing").handleWebhook(
    signedWebhook({ order_id: "pp-sub-cancel-race", payment_status: "order_canceled", sum: "1990.00", currency: "rub" }),
    response,
    { supabase: db, dispatchPendingSubscriptionEmails: async () => ({}) }
  );
  assert.equal(response.statusCode, 200);
  assert.equal(db.state.subscription.status, "success");
});

test("a valid late success callback can activate an order previously marked denied", async () => {
  const db = createPaymentDb({
    subscription: { id: "sub-late-success", provider_payment_id: "pp-sub-late-success", amount: 1990, currency: "rub", status: "denied" },
    activate: async (state) => {
      assert.equal(state.subscription.status, "denied");
      state.subscription.status = "success";
      state.subscription.period_start = "2026-12-02T00:00:00.000Z";
      state.subscription.period_end = "2027-01-01T00:00:00.000Z";
      return { data: { plan: "start", current_plan: "start", period_end: "2027-01-01", already_activated: false }, error: null };
    },
    credit: async () => ({ data: 0, error: null }),
  });
  const response = createWebhookResponse();
  await require("../billing").handleWebhook(
    signedWebhook({ order_id: "pp-sub-late-success", payment_status: "success", sum: "1990.00", currency: "rub" }),
    response,
    { supabase: db, dispatchPendingSubscriptionEmails: async () => ({}) }
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "success");
  assert.equal(db.state.subscription.status, "success");
  assert.equal(db.rpcCalls.activate, 1);
});


test("includes a per-request webhook URL only when Prodamus SYS is configured", async () => {
  const previous = {
    PRODAMUS_SECRET: process.env.PRODAMUS_SECRET,
    PRODAMUS_OFFLINE: process.env.PRODAMUS_OFFLINE,
    PRODAMUS_URL: process.env.PRODAMUS_URL,
    PRODAMUS_SYS: process.env.PRODAMUS_SYS,
  };
  try {
    process.env.PRODAMUS_SECRET = "shop-secret-test";
    process.env.PRODAMUS_OFFLINE = "1";
    process.env.PRODAMUS_URL = "https://example.payform.ru/";
    process.env.PRODAMUS_SYS = "pinposy_custom";
    const result = await prodamus.createPaymentLink({
      orderId: "pp-start-with-sys",
      amount: 1990,
      description: "PinPosy / Старт",
      urlNotification: "https://api.pinposy.com/billing/webhook",
    });
    const params = new URL(result.url).searchParams;
    assert.equal(params.get("sys"), "pinposy_custom");
    assert.equal(params.get("urlNotification"), "https://api.pinposy.com/billing/webhook");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
