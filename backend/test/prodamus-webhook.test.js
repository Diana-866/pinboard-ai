const test = require("node:test");
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
    delete process.env.PRODAMUS_SYS;
    const result = await prodamus.createPaymentLink({
      orderId: "pp-start-test",
      amount: 1990,
      description: "PinPosy / Старт",
      urlNotification: "https://api.pinposy.com/billing/webhook",
    });
    const params = new URL(result.url).searchParams;
    assert.equal(params.get("sys"), "");
    assert.equal(params.get("urlNotification"), "https://api.pinposy.com/billing/webhook");
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
