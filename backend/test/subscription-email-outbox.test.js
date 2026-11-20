"use strict";

const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");

/**
 * The subscription-activation email is the one message a paying customer always reads, and its
 * dispatcher had no direct test: the claim validation, the three template/payload rejections, the
 * "claim lost while sending" case and the retry bookkeeping all sat uncovered in billing.js.
 *
 * Migration 162 exists because this email was once lost entirely, so the properties are pinned
 * rather than assumed: one claim is fully validated before any email is sent, a failed send is
 * recorded as a retry with a safe error code (never provider text), and a claim that is no longer
 * ours is not counted as sent.
 */

const billingPath = require.resolve("../billing");
const supabasePath = require.resolve("../supabase");

/** Loads billing.js with a Supabase double and a mailer double. */
function loadBilling({ claimResult, markResult, retryResult, rpcErrors = {}, tables = {} } = {}) {
  const calls = { rpc: [], sent: [], tables: [] };

  const db = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (rpcErrors[name]) return { data: null, error: rpcErrors[name] };
      if (name === "claim_email_outbox") return { data: claimResult === undefined ? [] : claimResult, error: null };
      if (name === "mark_email_outbox_sent") return { data: markResult === undefined ? true : markResult, error: null };
      if (name === "retry_email_outbox") return { data: retryResult === undefined ? true : retryResult, error: null };
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
    from: (table) => {
      calls.tables.push(table);
      const handler = tables[table];
      const builder = {
        select: () => builder,
        insert: async (row) => (handler && handler.insert ? handler.insert(row) : { error: null }),
        update: () => builder,
        eq: () => builder,
        lte: () => builder,
        lt: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (resolve) => resolve(
          handler && handler.read ? handler.read() : { data: [], error: null, count: 0 }
        ),
      };
      return builder;
    },
  };

  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: db };
  delete require.cache[billingPath];
  const billing = require("../billing");

  const mail = {
    configured: true,
    transactionalMailConfigured() { return this.configured; },
    async sendMail(message) { calls.sent.push(message); return { ok: true }; },
  };

  return { billing, mail, calls };
}

function row(overrides = {}) {
  return {
    id: "outbox-1",
    claim_token: "claim-token-1",
    subscription_id: "sub-1",
    recipient_email: "customer@example.invalid",
    template_key: "subscription_activated",
    locale: "ru",
    payload: {
      paid_plan: "pro",
      current_plan: "start",
      period_end: "2026-12-19T00:00:00.000Z",
      amount: 4990,
      currency: "rub",
      payment_reference: "pp-pro-1",
    },
    ...overrides,
  };
}

test("an unconfigured mailer skips the queue without claiming anything", async () => {
  const { billing, mail, calls } = loadBilling();
  mail.configured = false;
  const result = await billing.dispatchPendingSubscriptionEmails(10, { supabase: undefined, mail });
  assert.deepEqual(result, { skipped: true, reason: "smtp_not_configured", processed: 0 });
  assert.equal(calls.rpc.length, 0, "no claim may be taken when nothing can be sent");
});

test("a claim that is not a valid batch stops before a single email is sent", async () => {
  const invalidBatches = [
    null,
    "not-an-array",
    {},
    [row({ id: "" })],
    [row({ claim_token: "  " })],
    [row({ recipient_email: "" })],
    [row({ template_key: null })],
    [row({ payload: null })],
    [row({ payload: [] })],
    [row(), row()], // more rows than the requested limit
  ];
  for (const claim of invalidBatches) {
    const { billing, mail, calls } = loadBilling({ claimResult: claim });
    await assert.rejects(
      () => billing.dispatchPendingSubscriptionEmails(1, { mail }),
      /invalid batch/,
      `claim ${JSON.stringify(claim)} must be refused`
    );
    assert.equal(calls.sent.length, 0, "a malformed batch must not send anything");
  }
});

test("a successful send is localized, stable and marked as sent", async () => {
  const { billing, mail, calls } = loadBilling({ claimResult: [row()] });
  const result = await billing.dispatchPendingSubscriptionEmails(10, { mail });

  assert.deepEqual(result, { skipped: false, processed: 1, sent: 1, failed: 0, unconfirmed: 0 });
  assert.equal(calls.sent.length, 1);
  const message = calls.sent[0];
  assert.equal(message.to, "customer@example.invalid");
  assert.match(message.subject, /Про/, "the Russian locale renders the plan title, not its id");
  assert.doesNotMatch(message.subject, /pro/, "the plan id never leaks into the subject");
  assert.match(message.text, /4990|4\s990/, "the amount from the payload is stated in the body");
  assert.match(message.messageId, /^<pinposy-subscription-sub-1@pinposy\.com>$/,
    "a stable message id makes a retry the same email for the mail client");

  const mark = calls.rpc.find((entry) => entry.name === "mark_email_outbox_sent");
  assert.deepEqual(mark.args, { p_id: "outbox-1", p_claim_token: "claim-token-1" },
    "the claim token proves we still own this row");
});

test("the email is written in the customer's language", async () => {
  for (const [locale, expected] of [["en", /payment received/i], ["de", /Zahlung/i], ["zh", /套餐/]]) {
    const { billing, mail, calls } = loadBilling({ claimResult: [row({ locale })] });
    await billing.dispatchPendingSubscriptionEmails(10, { mail });
    assert.match(calls.sent[0].subject, expected, `locale ${locale} must render its own subject`);
  }
});

test("an unsupported template is retried with a safe code and never sent", async () => {
  const { billing, mail, calls } = loadBilling({ claimResult: [row({ template_key: "password_changed" })] });
  const result = await billing.dispatchPendingSubscriptionEmails(10, { mail });

  assert.deepEqual(result, { skipped: false, processed: 1, sent: 0, failed: 1, unconfirmed: 0 });
  assert.equal(calls.sent.length, 0);
  const retry = calls.rpc.find((entry) => entry.name === "retry_email_outbox");
  assert.equal(retry.args.p_error_code, "unsupported_template");
  assert.equal(retry.args.p_claim_token, "claim-token-1");
});

test("a payload without a usable period end is retried instead of sending a broken date", async () => {
  for (const periodEnd of [null, "", "not-a-date", undefined]) {
    const { billing, mail, calls } = loadBilling({
      claimResult: [row({ payload: { ...row().payload, period_end: periodEnd } })],
    });
    const result = await billing.dispatchPendingSubscriptionEmails(10, { mail });
    assert.equal(result.failed, 1, `period_end ${JSON.stringify(periodEnd)} must fail`);
    assert.equal(calls.sent.length, 0);
    assert.equal(calls.rpc.find((entry) => entry.name === "retry_email_outbox").args.p_error_code, "invalid_payload");
  }
});

test("a claim that is no longer ours is counted as unconfirmed, not silently dropped", async () => {
  // Section 125. The mail went out, but the write that would confirm it was refused because another
  // worker holds the row now. Neither "sent" nor "failed" describes it, and leaving it out of every
  // counter made the batch summary not add up: processed 1, sent 0, failed 0 reads like a bug.
  const { billing, mail } = loadBilling({ claimResult: [row()], markResult: false });
  const result = await billing.dispatchPendingSubscriptionEmails(10, { mail });
  assert.equal(result.sent, 0, "another worker took the row; counting it as sent would hide a lost email");
  assert.equal(result.failed, 0);
  assert.equal(result.unconfirmed, 1, "the batch must say that one message has no confirmed outcome");
  assert.equal(
    result.sent + result.failed + result.unconfirmed,
    result.processed,
    "every claimed row must be accounted for in exactly one counter"
  );
});

test("a confirmed batch leaves nothing unconfirmed", async () => {
  const { billing, mail } = loadBilling({ claimResult: [row(), row({ id: "outbox-2", claim_token: "claim-token-2", subscription_id: "sub-2" })] });
  const result = await billing.dispatchPendingSubscriptionEmails(10, { mail });
  assert.equal(result.sent, 2);
  assert.equal(result.unconfirmed, 0);
  assert.equal(result.sent + result.failed + result.unconfirmed, result.processed);
});

test("a failed retry write does not stop the rest of the batch", async () => {
  const { billing, mail, calls } = loadBilling({
    claimResult: [row({ template_key: "unsupported" }), row({ id: "outbox-2", claim_token: "claim-token-2", subscription_id: "sub-2" })],
    rpcErrors: { retry_email_outbox: { message: "retry write failed" } },
  });
  const result = await billing.dispatchPendingSubscriptionEmails(10, { mail });

  assert.equal(result.processed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.sent, 1, "the second row is still attempted");
  assert.equal(calls.sent.length, 1);
});

test("a provider error code is bounded before it is stored", async () => {
  const { billing, mail, calls } = loadBilling({ claimResult: [row()] });
  // The dispatcher only stores codes that look like codes, so a message full of provider text
  // cannot end up in the outbox table.
  const mailDouble = {
    ...mail,
    async sendMail(message) {
      calls.sent.push(message);
      const error = new Error("550 5.1.1 <customer@example.invalid>: Recipient address rejected");
      error.code = "550 5.1.1 <customer@example.invalid>: Recipient address rejected";
      throw error;
    },
  };
  await billing.dispatchPendingSubscriptionEmails(10, { mail: mailDouble });
  const retry = calls.rpc.find((entry) => entry.name === "retry_email_outbox");
  assert.equal(retry.args.p_error_code, "smtp_error", "an unusable code is replaced, not truncated into the table");
  assert.doesNotMatch(retry.args.p_error_code, /customer@example\.invalid/);
});

test("the outbox health endpoint reports counts, ages and dead items", async () => {
  const created = new Date(Date.now() - 90_000).toISOString();
  const nextAttempt = new Date(Date.now() - 60_000).toISOString();
  const counters = {
    pending: { count: 3 },
    sending: { count: 1 },
    dead: { count: 2 },
    duePending: { count: 1 },
    staleSending: { count: 0 },
    oldestPending: { data: [{ created_at: created }] },
    oldestDuePending: { data: [{ next_attempt_at: nextAttempt }] },
    deadRows: {
      data: [{
        id: "dead-1", attempts: 5, max_attempts: 5, last_error_code: "invalid_payload",
        created_at: created, updated_at: created,
      }],
    },
  };
  const { billing } = loadBilling({
    tables: {
      email_outbox: {
        read: () => ({ data: [], error: null, count: 0 }),
      },
    },
  });

  // The health builder reads through a query builder; drive it with an explicit double instead of
  // the generic one so each counter can differ.
  const db = {
    from: (table) => {
      assert.equal(table, "email_outbox");
      const state = { filters: {}, order: null, limit: null, select: null };
      const builder = {
        select(columns, options) { state.select = { columns, options }; return builder; },
        eq(column, value) { state.filters[column] = value; return builder; },
        lte(column, value) { state.filters[column] = value; state.lte = true; return builder; },
        lt(column, value) { state.filters[column] = value; state.lt = true; return builder; },
        order() { return builder; },
        limit(count) { state.limit = count; return builder; },
        then(resolve) {
          // Distinguish the four shapes the builder is used for.
          if (state.select && state.select.options && state.select.options.head) {
            // The narrower predicates win: "pending AND due" is not "pending".
            if (state.lte && state.filters.status === "pending") {
              return resolve({ data: null, error: null, count: counters.duePending.count });
            }
            if (state.lt && state.filters.status === "sending") {
              return resolve({ data: null, error: null, count: counters.staleSending.count });
            }
            if (state.filters.status === "pending") return resolve({ data: null, error: null, count: counters.pending.count });
            if (state.filters.status === "sending") return resolve({ data: null, error: null, count: counters.sending.count });
            if (state.filters.status === "dead") return resolve({ data: null, error: null, count: counters.dead.count });
          }
          // Row queries are distinguished by the status they filter on.
          if (state.filters.status === "pending" && state.lte) {
            return resolve({ data: counters.oldestDuePending.data, error: null });
          }
          if (state.filters.status === "pending") {
            return resolve({ data: counters.oldestPending.data, error: null });
          }
          return resolve({ data: counters.deadRows.data, error: null });
        },
      };
      return builder;
    },
  };

  const health = await billing.getEmailOutboxHealth(20, { supabase: db });
  assert.equal(health.counts.pending, 3);
  assert.equal(health.counts.due_pending, 1);
  assert.equal(health.counts.sending, 1);
  assert.equal(health.counts.stale_sending, 0);
  assert.equal(health.counts.dead, 2);
  assert.ok(health.oldest_pending_age_seconds >= 90, "the age of the oldest pending email is exported");
  assert.ok(health.oldest_due_pending_age_seconds >= 60);
  assert.deepEqual(health.dead_items, [{
    id: "dead-1", attempts: 5, max_attempts: 5, last_error_code: "invalid_payload",
    created_at: created, updated_at: created,
  }]);
  assert.ok(health.generated_at, "the report says when it was produced");
});
