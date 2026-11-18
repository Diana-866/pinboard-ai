"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const root = (file) => fs.readFileSync(path.join(__dirname, "..", "..", file), "utf8");

test("the public Prodamus webhook parses bounded supported bodies and dispatches by server order prefix", () => {
  const index = root("backend/index.js");
  assert.match(index, /limits:\s*\{ fields: 80, fieldSize: 16 \* 1024, files: 0 \}/);
  assert.match(index, /req\.is\("multipart\/form-data"\)/);
  assert.match(index, /req\.is\("application\/x-www-form-urlencoded"\)/);
  assert.match(index, /req\.is\("application\/json"\)/);
  assert.match(index, /app\.post\("\/billing\/webhook", parseProdamusWebhook/);
  assert.match(index, /startsWith\(\s*creditsBilling\.ORDER_PREFIX \+ "-"/);
  assert.match(index, /creditsBilling\.handleCreditsWebhook : billing\.handleWebhook/);
});

test("both payment handlers authenticate the provider signature before reading any order", () => {
  const subscription = read("billing.js");
  const credits = read("creditsBilling.js");
  for (const source of [subscription, credits]) {
    const handler = source.slice(source.indexOf("async function handle"));
    const signature = handler.indexOf("prodamus.verifyWebhook(body, req.headers)");
    const lookup = handler.indexOf('.from("subscriptions")') >= 0
      ? handler.indexOf('.from("subscriptions")')
      : handler.indexOf('.from("credit_purchases")');
    assert.notEqual(signature, -1);
    assert.notEqual(lookup, -1);
    assert.ok(signature < lookup, "provider signature must be checked before DB order lookup");
    assert.match(handler.slice(0, lookup), /if \(!check\.ok\)[\s\S]*?return res\.status\(403\)/);
  }
});

test("both handlers persist verified provider receipts before any local order lookup", () => {
  for (const file of ["billing.js", "creditsBilling.js"]) {
    const source = read(file);
    const handler = source.slice(source.indexOf(file === "billing.js" ? "async function handleWebhook" : "async function handleCreditsWebhook"));
    const signature = handler.indexOf("prodamus.verifyWebhook(body, req.headers)");
    const receipt = handler.indexOf("persistProviderReceipt(db");
    const lookup = handler.indexOf(file === "billing.js" ? '.from("subscriptions")' : '.from("credit_purchases")');
    assert.ok(signature >= 0 && receipt > signature && lookup > receipt,
      file + " must persist the authenticated provider event before local lookup");
    assert.match(handler.slice(receipt, lookup), /receipt storage failed/);
    assert.match(handler.slice(receipt, lookup), /return res\.status\(500\)/);
  }
});

test("invalid amount branches do not overwrite terminal receipt decisions", () => {
  for (const file of ["billing.js", "creditsBilling.js"]) {
    const source = read(file);
    const start = source.indexOf("if (!paymentAmount.ok)");
    const end = source.indexOf("const expected = Number(", start);
    assert.ok(start >= 0 && end > start, file + " invalid amount branch must exist");
    const branch = source.slice(start, end);
    assert.match(branch, /decision: "rejected_mismatch"/);
    assert.doesNotMatch(branch, /decision: "pending_review"/);
  }
});

test("payment fulfillment requires signed amount/currency match and records mismatches", () => {
  const subscription = read("billing.js");
  const credits = read("creditsBilling.js");
  for (const source of [subscription, credits]) {
    assert.match(source, /prodamus\.getWebhookPaymentAmount\(body, (?:sub|purchase)\.currency \|\| "rub"\)/);
    assert.match(source, /Math\.abs\(sum - expected\) > 0\.01/);
    assert.match(source, /reason: "amount_mismatch"/);
    assert.match(source, /review_required: true/);
  }
  assert.match(subscription, /db\.rpc\("activate_paid_subscription"/);
  assert.match(credits, /db\.rpc\("credit_paid_purchase"/);
});

test("credit fulfillment uses the atomic purchase marker and reconciles the exact checkout order", () => {
  const sql = root("db/migrations/010_atomic_credit_ledger.sql");
  const settle = root("db/migrations/118_settle_payment_creation_after_webhook.sql");
  assert.match(sql, /select \* into v_purchase[\s\S]*?for update/);
  assert.match(sql, /if v_purchase\.balance_credited_at is not null then[\s\S]*?return v_balance/);
  assert.match(sql, /insert into public\.credit_transactions[\s\S]*?purchase_id/);
  assert.match(sql, /set status = 'success',[\s\S]*?balance_credited_at = now\(\)/);
  assert.match(settle, /v_local_user_id is distinct from v_request\.user_id/);
  assert.match(settle, /v_local_order_id is distinct from p_order_id/);
  assert.match(settle, /v_local_status is distinct from 'success'/);
  assert.match(settle, /v_balance_credited_at is null/);
});

test("checkout idempotency keys are unique per user and provider order references are unique", () => {
  const create = root("db/migrations/116_idempotent_prodamus_checkout_creation.sql");
  const order = root("db/migrations/117_payment_creation_provider_order_reference.sql");
  assert.match(create, /unique \(user_id, idempotency_key\)/);
  assert.match(create, /idempotency key reused with different payment request/);
  assert.match(create, /status = 'unknown'/);
  assert.match(order, /create unique index[\s\S]*?on public\.payment_creation_requests\(provider_order_id\)/);
});

test("webhook exception audit is deduplicated and cannot be read by public or ordinary clients", () => {
  const audit = root("db/migrations/029_billing_webhook_exceptions.sql");
  assert.match(audit, /event_hash text not null unique/);
  assert.match(audit, /revoke all on public\.billing_webhook_exceptions from public, anon, authenticated/);
  assert.match(audit, /revoke all on public\.billing_webhook_exceptions from service_role/);
  assert.match(audit, /grant insert on public\.billing_webhook_exceptions to service_role/);
});

test("Prodamus webhook signatures use HMAC and constant-time comparison", () => {
  const prodamus = read("prodamus.js");
  assert.match(prodamus, /createHmac\("sha256", secret\)/);
  assert.match(prodamus, /safeEqual\(expectedB64, provided\) \|\| safeEqual\(expectedHex, provided\)/);
  assert.match(prodamus, /PRODAMUS_SECRET_WEBHOOK \|\| process\.env\.PRODAMUS_SECRET/);
});


test("Prodamus CI runs ambiguous checkout and billing security regression coverage", () => {
  const workflow = root(".github/workflows/prodamus-checkout-tests.yml");
  const occurrences = (value) => workflow.split(value).length - 1;
  assert.equal(
    occurrences('"backend/test/prodamus-ambiguous-checkout.test.js"'),
    2,
    "push and pull_request path filters must both include ambiguous checkout coverage"
  );
  assert.equal(
    occurrences('"backend/test/billing-security-contract.test.js"'),
    2,
    "push and pull_request path filters must both include this workflow contract"
  );
  assert.equal(
    occurrences('"backend/paymentProviderReceipts.js"'),
    2,
    "push and pull_request path filters must both include receipt persistence changes"
  );
  assert.equal(
    occurrences('"backend/test/payment-provider-receipts.test.js"'),
    2,
    "push and pull_request path filters must both include receipt journal unit tests"
  );
  assert.ok(
    workflow.includes("node --test test/prodamus-webhook.test.js test/payment-creation-settlement.test.js test/prodamus-ambiguous-checkout.test.js test/billing-webhook-audit.test.js test/billing-security-contract.test.js test/prodamus-endpoint-security.test.js test/payment-provider-receipts.test.js"),
    "checkout job must execute all billing and ambiguous-checkout regression tests"
  );
  assert.equal(
    occurrences('"backend/billingWebhookAudit.js"'),
    2,
    "push and pull_request path filters must both include webhook audit persistence changes"
  );
  assert.equal(
    occurrences('"backend/test/billing-webhook-audit.test.js"'),
    2,
    "push and pull_request path filters must both include webhook audit persistence tests"
  );
  assert.ok(
    workflow.includes("test/billing-webhook-audit.test.js"),
    "checkout job must execute webhook audit persistence regressions"
  );
  assert.equal(
    occurrences('"backend/test/prodamus-endpoint-security.test.js"'),
    2,
    "push and pull_request path filters must both include Prodamus endpoint security tests"
  );
  assert.doesNotMatch(workflow, /Test checkout idempotency and ambiguous provider failures/);
});


test("subscription and credit checkout validate per-request webhook URLs before reserving payment idempotency", () => {
  for (const file of ["billing.js", "creditsBilling.js"]) {
    const source = read(file);
    const validation = source.indexOf("prodamus.validateWebhookNotificationUrl(notificationUrl)");
    const reservation = source.indexOf("beginPaymentCreation(userId, idempotencyKey");
    assert.notEqual(validation, -1, file + " must validate configured webhook URL");
    assert.notEqual(reservation, -1, file + " must reserve checkout idempotency");
    assert.ok(validation < reservation, file + " must reject insecure callback configuration before reserving a payment");
    assert.match(source, /urlNotification: notificationUrl/);
  }
});
