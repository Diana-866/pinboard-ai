const test = require("node:test");
const assert = require("node:assert/strict");
const { buildWebhookException } = require("../billingWebhookAudit");

test("webhook exception fingerprint is deterministic and scoped by payment type", () => {
  const body = {
    order_id: "ppc-pack_100-123",
    payment_status: "success",
    sum: "190.00",
    customer_email: "private@example.com",
  };
  const a = buildWebhookException({
    paymentKind: "credits", body, expectedAmount: 190, reason: "amount_mismatch",
  });
  const b = buildWebhookException({
    paymentKind: "credits", body, expectedAmount: 190, reason: "amount_mismatch",
  });
  const subscription = buildWebhookException({
    paymentKind: "subscription", body, expectedAmount: 190, reason: "amount_mismatch",
  });

  assert.equal(a.event_hash, b.event_hash);
  assert.notEqual(a.event_hash, subscription.event_hash);
  assert.match(a.event_hash, /^[a-f0-9]{64}$/);
  assert.equal(a.order_id, body.order_id);
  assert.equal(a.received_sum, "190.00");
  assert.equal(a.expected_amount, 190);
  assert.equal("customer_email" in a, false);
  assert.equal(JSON.stringify(a).includes("private@example.com"), false);
});

test("webhook retry attempt number does not create a second event fingerprint", () => {
  const common = {
    order_id: "ppc-pack_100-123",
    payment_status: "success",
    sum: "190.00",
    date: "2026-11-05T12:00:00+03:00",
  };
  const first = buildWebhookException({
    paymentKind: "credits", body: { ...common, attempt: "1" }, expectedAmount: 190, reason: "amount_mismatch",
  });
  const retry = buildWebhookException({
    paymentKind: "credits", body: { ...common, attempt: "2" }, expectedAmount: 190, reason: "amount_mismatch",
  });
  assert.equal(first.event_hash, retry.event_hash);
});

test("webhook exception stores the currency-denominated amount and currency", () => {
  const record = buildWebhookException({
    paymentKind: "subscription",
    body: {
      order_id: "pp-start-usd-1",
      sum: "24.00",
      currency: "usd",
    },
    expectedAmount: 24,
    reason: "currency_mismatch",
  });
  assert.equal(record.received_sum, "24.00");
  assert.equal(record.received_currency, "usd");
});

test("webhook exception preserves malformed amounts without treating them as expected amounts", () => {
  const record = buildWebhookException({
    paymentKind: "subscription",
    body: { order_id: "pp-start-1", sum: "not-a-number" },
    expectedAmount: null,
    reason: "amount_mismatch",
  });
  assert.equal(record.received_sum, "not-a-number");
  assert.equal(record.expected_amount, null);
});
