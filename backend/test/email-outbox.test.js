const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");
const { dispatchPendingSubscriptionEmails } = require("../billing");

test("SMTP accepted but sent acknowledgement failed: retry reuses deterministic Message-ID", async () => {
  const row = {
    id: "outbox-1",
    claim_token: "claim-1",
    subscription_id: "subscription-1",
    recipient_email: "customer@example.test",
    locale: "en",
    template_key: "subscription_activated",
    payload: {
      paid_plan: "pro",
      current_plan: "pro",
      period_end: "2026-12-07T00:00:00.000Z",
      amount: 4990,
      currency: "rub",
      payment_reference: "payment-1",
    },
  };
  let claimCount = 0;
  let markCount = 0;
  const db = {
    async rpc(name) {
      if (name === "claim_email_outbox") {
        claimCount += 1;
        return { data: claimCount === 1 ? [{ ...row, claim_token: "claim-1" }] : [{ ...row, claim_token: "claim-2" }], error: null };
      }
      if (name === "mark_email_outbox_sent") {
        markCount += 1;
        if (markCount === 1) return { data: null, error: { code: "08006", message: "connection lost after SMTP acceptance" } };
        return { data: true, error: null };
      }
      if (name === "retry_email_outbox") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const acceptedMessages = [];
  const mailer = {
    transactionalMailConfigured: () => true,
    async sendMail(message) {
      acceptedMessages.push(message);
      return { ok: true };
    },
  };

  await dispatchPendingSubscriptionEmails(10, { supabase: db, mail: mailer });
  await dispatchPendingSubscriptionEmails(10, { supabase: db, mail: mailer });

  assert.equal(acceptedMessages.length, 2, "at-least-once delivery can send twice after an ambiguous DB result");
  assert.equal(acceptedMessages[0].messageId, "<pinposy-subscription-subscription-1@pinposy.com>");
  assert.equal(acceptedMessages[1].messageId, acceptedMessages[0].messageId, "retry must preserve the same deterministic Message-ID");
  assert.equal(markCount, 2);
});


test("email outbox health reports counts and dead rows without customer PII or payload", async () => {
  const now = new Date().toISOString();
  const db = {
    from(table) {
      assert.equal(table, "email_outbox");
      const query = { filters: {}, columns: "", options: {} };
      query.select = function(columns, options) { this.columns = columns; this.options = options || {}; return this; };
      query.eq = function(column, value) { this.filters[column] = value; return this; };
      query.lt = function(column, value) { this.filters[`lt:${column}`] = value; return this; };
      query.lte = function(column, value) { this.filters[`lte:${column}`] = value; return this; };
      query.order = function(column, options) { this.orderBy = [column, options]; return this; };
      query.limit = function(value) { this.limitValue = value; return this; };
      query.then = function(resolve, reject) {
        let result;
        if (this.options.head) {
          const status = this.filters.status;
          const count = this.filters["lt:locked_until"] ? 1
            : this.filters["lte:next_attempt_at"] ? 2
            : ({ pending: 3, sending: 2, dead: 1 })[status] || 0;
          result = { data: null, count, error: null };
        } else if (this.filters.status === "pending" && this.filters["lte:next_attempt_at"]) {
          result = { data: [{ next_attempt_at: "2026-11-07T09:00:00.000Z" }], error: null };
        } else if (this.filters.status === "pending") {
          result = { data: [{ created_at: "2026-11-07T10:00:00.000Z" }], error: null };
        } else {
          result = {
            data: [{
              id: "dead-1", attempts: 8, max_attempts: 8,
              last_error_code: "smtp_error", created_at: "2026-11-01T10:00:00.000Z",
              updated_at: "2026-11-07T10:00:00.000Z",
              recipient_email: "private@example.test", payload: { secret: "must-not-leak" },
            }],
            error: null,
          };
        }
        return Promise.resolve(result).then(resolve, reject);
      };
      return query;
    },
  };

  const { getEmailOutboxHealth } = require("../billing");
  const health = await getEmailOutboxHealth(10, { supabase: db });

  assert.deepEqual(health.counts, { pending: 3, due_pending: 2, sending: 2, stale_sending: 1, dead: 1 });
  assert.equal(health.oldest_pending_at, "2026-11-07T10:00:00.000Z");
  assert.equal(health.oldest_due_pending_at, "2026-11-07T09:00:00.000Z");
  assert.ok(health.oldest_due_pending_age_seconds >= 0);
  assert.equal(health.dead_items.length, 1);
  assert.equal(health.dead_items[0].id, "dead-1");
  assert.equal("recipient_email" in health.dead_items[0], false);
  assert.equal("payload" in health.dead_items[0], false);
  assert.equal(JSON.stringify(health).includes("private@example.test"), false);
  assert.equal(JSON.stringify(health).includes("must-not-leak"), false);
});

test("email outbox claim accepts only bounded batches with complete unique lease identity", () => {
  const { isValidEmailOutboxClaimRows } = require("../billing");
  const valid = [{ id: "outbox-1", claim_token: "claim-1", subscription_id: "subscription-1", recipient_email: "customer@example.test", template_key: "subscription_activated", payload: { paid_plan: "pro" } }];
  assert.equal(isValidEmailOutboxClaimRows([], 10), true);
  assert.equal(isValidEmailOutboxClaimRows(valid, 10), true);
  for (const malformed of [null, undefined, {}, "not-an-array", [null], [{ ...valid[0], claim_token: "" }], [{ ...valid[0], subscription_id: null }], [{ ...valid[0], recipient_email: "" }], [{ ...valid[0], payload: null }], [valid[0], valid[0]], [valid[0], { ...valid[0], id: "outbox-2", claim_token: "claim-2" }]]) {
    assert.equal(isValidEmailOutboxClaimRows(malformed, 1), false);
  }
  assert.equal(isValidEmailOutboxClaimRows(valid, 0), false);
});

test("malformed email outbox claim responses fail before sending or retrying any row", async () => {
  for (const data of [null, {}, "not-an-array", [{ id: "outbox-1" }]]) {
    let sendCount = 0;
    let followupRpcCount = 0;
    const db = { async rpc(name) { if (name === "claim_email_outbox") return { data, error: null }; followupRpcCount += 1; return { data: true, error: null }; } };
    const mailer = { transactionalMailConfigured: () => true, async sendMail() { sendCount += 1; } };
    await assert.rejects(dispatchPendingSubscriptionEmails(10, { supabase: db, mail: mailer }), /invalid batch/);
    assert.equal(sendCount, 0);
    assert.equal(followupRpcCount, 0);
  }
});

test("a valid empty email outbox claim is reported as an idle queue", async () => {
  const result = await dispatchPendingSubscriptionEmails(10, { supabase: { rpc: async () => ({ data: [], error: null }) }, mail: { transactionalMailConfigured: () => true } });
  assert.deepEqual(result, { skipped: false, processed: 0, sent: 0, failed: 0, unconfirmed: 0 });
});

test("outbox health refuses malformed count and list envelopes instead of reporting zero mail", async () => {
  const { getEmailOutboxHealth } = require("../billing");
  for (const malformedKind of ["count", "dead_rows"]) {
    const db = {
      from(table) {
        assert.equal(table, "email_outbox");
        const query = { columns: "", options: {}, filters: {} };
        query.select = function(columns, options) { this.columns = columns; this.options = options || {}; return this; };
        query.eq = function(column, value) { this.filters[column] = value; return this; };
        query.lt = function(column, value) { this.filters["lt:" + column] = value; return this; };
        query.lte = function(column, value) { this.filters["lte:" + column] = value; return this; };
        query.order = function() { return this; };
        query.limit = function() { return this; };
        query.then = function(resolve, reject) {
          const result = this.options.head
            ? { data: null, count: malformedKind === "count" ? null : 0, error: null }
            : {
                data: malformedKind === "dead_rows" && this.columns.includes("attempts") ? null : [],
                error: null,
              };
          return Promise.resolve(result).then(resolve, reject);
        };
        return query;
      },
    };
    await assert.rejects(
      getEmailOutboxHealth(10, { supabase: db }),
      (error) => error.httpStatus === 502
    );
  }
});

