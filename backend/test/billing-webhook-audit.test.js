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
      sum: "3100.00",
      currency: "usd",
      currency_sum: "24.00",
    },
    expectedAmount: 24,
    reason: "currency_mismatch",
  });
  assert.equal(record.received_sum, "24.00");
  assert.equal(record.received_currency, "usd");
});

test("webhook exception does not select currency_sum when currency is absent", () => {
  const record = buildWebhookException({
    paymentKind: "subscription",
    body: {
      order_id: "pp-start-ambiguous-1",
      sum: "3100.00",
      currency_sum: "24.00",
    },
    reason: "currency_missing",
  });
  assert.equal(record.received_sum, "3100.00");
  assert.equal(record.received_currency, null);
});

test("RUB webhook exception records sum even when currency_sum is also present", () => {
  const record = buildWebhookException({
    paymentKind: "subscription",
    body: {
      order_id: "pp-start-rub-1",
      sum: "3100.00",
      currency: "RUB",
      currency_sum: "24.00",
    },
    reason: "amount_mismatch",
  });
  assert.equal(record.received_sum, "3100.00");
  assert.equal(record.received_currency, "rub");
});

test("explicit non-RUB webhook exception records the matching currency_sum", () => {
  const record = buildWebhookException({
    paymentKind: "subscription",
    body: {
      order_id: "pp-start-usd-2",
      sum: "3100.00",
      currency: "usd",
      currency_sum: "24.00",
    },
    reason: "amount_mismatch",
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


function exceptionDetails(overrides = {}) {
  return {
    paymentKind: "credits",
    body: { order_id: "ppc-pack_100-123", payment_status: "success", sum: "190.00" },
    expectedAmount: 190,
    reason: "amount_mismatch",
    ...overrides,
  };
}

test("persistWebhookException treats only an event_hash uniqueness conflict as a duplicate delivery", async () => {
  const { persistWebhookException } = require("../billingWebhookAudit");
  const details = exceptionDetails();
  const expectedHash = buildWebhookException(details).event_hash;
  const duplicateError = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "billing_webhook_exceptions_event_hash_key"',
    details: "Key (event_hash)=(abc) already exists.",
  };
  const db = {
    from(table) {
      assert.equal(table, "billing_webhook_exceptions");
      return {
        async insert(record) {
          assert.equal(record.event_hash, expectedHash);
          return { error: duplicateError };
        },
      };
    },
  };
  assert.equal(await persistWebhookException(db, details), expectedHash);
});

test("persistWebhookException propagates unrelated unique-constraint violations", async () => {
  const { persistWebhookException } = require("../billingWebhookAudit");
  const primaryKeyError = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "billing_webhook_exceptions_pkey"',
    details: "Key (id)=(00000000-0000-0000-0000-000000000001) already exists.",
  };
  const db = {
    from() {
      return {
        async insert() { return { error: primaryKeyError }; },
      };
    },
  };
  await assert.rejects(
    persistWebhookException(db, exceptionDetails()),
    (error) => error === primaryKeyError
  );
});

test("persistWebhookException propagates non-unique database failures", async () => {
  const { persistWebhookException } = require("../billingWebhookAudit");
  const databaseError = { code: "08006", message: "connection failure" };
  const db = {
    from() {
      return {
        async insert() { return { error: databaseError }; },
      };
    },
  };
  await assert.rejects(
    persistWebhookException(db, exceptionDetails()),
    (error) => error === databaseError
  );
});


test("persistWebhookException recognizes an event_hash duplicate from PostgreSQL detail text", async () => {
  const { persistWebhookException } = require("../billingWebhookAudit");
  const expectedHash = buildWebhookException(exceptionDetails()).event_hash;
  const duplicateError = {
    code: "23505",
    message: "duplicate key value violates unique constraint",
    details: "Key (event_hash)=(abc) already exists.",
  };
  const db = {
    from() {
      return {
        async insert() { return { error: duplicateError }; },
      };
    },
  };
  assert.equal(await persistWebhookException(db, exceptionDetails()), expectedHash);
});
