"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildProviderReceipt,
  persistProviderReceipt,
  setProviderDecision,
} = require("../paymentProviderReceipts");

function signedEvent(overrides = {}) {
  return {
    order_id: "ppc-pack_100-abc",
    payment_status: "success",
    sum: "190.00",
    currency: "rub",
    customer_email: "must-not-be-stored@example.invalid",
    ...overrides,
  };
}

test("receipt fingerprint is stable across Prodamus retry attempts and excludes customer PII", () => {
  const first = buildProviderReceipt({
    paymentKind: "credits",
    body: signedEvent({ attempt: "1" }),
  });
  const retry = buildProviderReceipt({
    paymentKind: "credits",
    body: signedEvent({ attempt: "2" }),
  });
  const subscription = buildProviderReceipt({
    paymentKind: "subscription",
    body: signedEvent(),
  });

  assert.equal(first.event_hash, retry.event_hash);
  assert.notEqual(first.event_hash, subscription.event_hash);
  assert.match(first.event_hash, /^[a-f0-9]{64}$/);
  assert.equal(first.provider_status, "success");
  assert.equal(first.received_amount, 190);
  assert.equal(first.received_currency, "rub");
  assert.equal(JSON.stringify(first).includes("must-not-be-stored"), false);
  assert.equal(Object.hasOwn(first, "customer_email"), false);
});

test("receipt uses currency_sum only with an explicit supported foreign currency", () => {
  const receipt = buildProviderReceipt({
    paymentKind: "subscription",
    body: signedEvent({ sum: "3100.00", currency: "usd", currency_sum: "24.00" }),
  });
  assert.equal(receipt.received_amount, 24);
  assert.equal(receipt.received_currency, "usd");
});

test("receipt bounds order, amount and status fields without storing arbitrary provider text", () => {
  const receipt = buildProviderReceipt({
    paymentKind: "credits",
    body: signedEvent({
      order_id: "x".repeat(201),
      payment_status: "provider-new-state-with-arbitrary-detail",
      sum: "not-a-number",
      currency: "unknown",
    }),
  });
  assert.equal(receipt.provider_order_id, null);
  assert.equal(receipt.provider_status, "unrecognized");
  assert.equal(receipt.received_amount, null);
  assert.equal(receipt.received_currency, null);
});

test("unsupported explicit currencies never inherit the RUB sum as a foreign-currency amount", () => {
  const receipt = buildProviderReceipt({
    paymentKind: "subscription",
    body: signedEvent({ sum: "1990.00", currency: "gbp", currency_sum: "24.00" }),
  });
  assert.equal(receipt.received_amount, null);
  assert.equal(receipt.received_currency, null);
});

test("receipt persistence calls the service-only RPC and requires a returned identity", async () => {
  const record = buildProviderReceipt({ paymentKind: "credits", body: signedEvent() });
  const calls = [];
  const db = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: "00000000-0000-4000-8000-000000000158", error: null };
    },
  };
  const result = await persistProviderReceipt(db, { paymentKind: "credits", body: signedEvent() });
  assert.equal(result.receiptId, "00000000-0000-4000-8000-000000000158");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "record_prodamus_payment_receipt");
  assert.equal(calls[0].args.p_event_hash, record.event_hash);
  assert.equal("customer_email" in calls[0].args, false);
});

test("receipt persistence propagates database failures and rejects empty RPC results", async () => {
  const failure = { code: "08006", message: "database unavailable" };
  await assert.rejects(
    persistProviderReceipt({ rpc: async () => ({ data: null, error: failure }) },
      { paymentKind: "credits", body: signedEvent() }),
    (error) => error === failure
  );
  await assert.rejects(
    persistProviderReceipt({ rpc: async () => ({ data: null, error: null }) },
      { paymentKind: "credits", body: signedEvent() }),
    /no receipt id/
  );
});

test("decision updates use the durable state RPC and reject unconfirmed persistence", async () => {
  let call;
  const db = {
    async rpc(name, args) {
      call = { name, args };
      return { data: true, error: null };
    },
  };
  await setProviderDecision(db, {
    receiptId: "00000000-0000-4000-8000-000000000158",
    decision: "granted",
    paymentKind: "credits",
    paymentId: "00000000-0000-4000-8000-000000000159",
    userId: "owner-uuid",
  });
  assert.equal(call.name, "set_prodamus_payment_decision");
  assert.equal(call.args.p_decision, "granted");
  assert.equal(call.args.p_user_id, "owner-uuid");
  await assert.rejects(
    setProviderDecision({ rpc: async () => ({ data: false, error: null }) }, {
      receiptId: "00000000-0000-4000-8000-000000000158",
      decision: "granted",
    }),
    /did not confirm/
  );
});
