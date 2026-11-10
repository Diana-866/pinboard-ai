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

test("rejects malformed and oversized nested multipart fields", () => {
  for (const field of ["order_id]suffix", "products[0]suffix", "products[[0]]", "products[]"]) {
    assert.throws(() => parseMultipartFields({ [field]: "x" }));
  }
  assert.throws(() => parseMultipartFields({ "products[999999999][name]": "x" }), /out of range/);
  assert.throws(() => parseMultipartFields({ "products[80][name]": "x" }), /out of range/);
  assert.throws(() => parseMultipartFields({
    "products[0][name]": "PinPosy",
    "products[name]": "conflicting structure",
  }), /numeric indexes/);
});

test("encodes nested Prodamus products as bracketed form fields", () => {
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

test("offline checkout URL contains signed nested product fields and SYS", async () => {
  const keys = ["PRODAMUS_SECRET", "PRODAMUS_OFFLINE", "PRODAMUS_URL", "PRODAMUS_SYS"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.PRODAMUS_SECRET = "shop-secret-test";
    process.env.PRODAMUS_OFFLINE = "1";
    process.env.PRODAMUS_URL = "https://pinposy-test.payform.ru/";
    delete process.env.PRODAMUS_SYS;
    const result = await prodamus.createPaymentLink({
      orderId: "pp-start-test",
      amount: 1990,
      description: "PinPosy / Старт",
      urlNotification: "https://api.pinposy.com/billing/webhook",
      urlSuccess: "https://pinposy.com/app?payment=success",
    });
    const params = new URL(result.url).searchParams;
    assert.equal(params.get("sys"), "");
    assert.equal(params.get("urlNotification"), "https://api.pinposy.com/billing/webhook");
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

test("accepts only secure Prodamus checkout URLs", () => {
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
    assert.throws(() => prodamus.validateCheckoutUrl(url), error => error.httpStatus === 502);
  }
});
