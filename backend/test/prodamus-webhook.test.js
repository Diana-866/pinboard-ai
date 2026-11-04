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
    .update(prodamus.canonicalString(payload), "utf8").digest("base64");
  assert.equal(prodamus.signPayload(payload), expected);
});
