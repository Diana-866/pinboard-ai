const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

process.env.PRODAMUS_SECRET = "shop-secret-for-test";
process.env.PRODAMUS_SECRET_WEBHOOK = "webhook-secret-for-test";

const prodamus = require("../prodamus");

test("outgoing payment link signature uses shop secret, not webhook secret", () => {
  const payload = { order_id: "order-123", sum: "1990.00" };
  const expected = crypto.createHmac("sha256", process.env.PRODAMUS_SECRET)
    .update(prodamus.canonicalString(payload), "utf8").digest("base64");
  assert.equal(prodamus.signPayload(payload), expected);
});

test("incoming webhook signature uses dedicated webhook secret", () => {
  const payload = { order_id: "order-123", payment_status: "success", sum: "1990.00" };
  const signature = crypto.createHmac("sha256", process.env.PRODAMUS_SECRET_WEBHOOK)
    .update(prodamus.canonicalString(payload), "utf8").digest("base64");
  assert.deepEqual(prodamus.verifyWebhook(payload, { sign: signature }), { ok: true });
});

test("webhook signature from shop secret is rejected when webhook secret differs", () => {
  const payload = { order_id: "order-123", payment_status: "success", sum: "1990.00" };
  const signature = crypto.createHmac("sha256", process.env.PRODAMUS_SECRET)
    .update(prodamus.canonicalString(payload), "utf8").digest("base64");
  assert.equal(prodamus.verifyWebhook(payload, { sign: signature }).ok, false);
});
