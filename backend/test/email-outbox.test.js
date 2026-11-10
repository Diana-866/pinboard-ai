const test = require("node:test");
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
      query.order = function(column, options) { this.orderBy = [column, options]; return this; };
      query.limit = function(value) { this.limitValue = value; return this; };
      query.then = function(resolve, reject) {
        let result;
        if (this.options.head) {
          const status = this.filters.status;
          const count = this.filters["lt:locked_until"] ? 1 : ({ pending: 3, sending: 2, dead: 1 })[status] || 0;
          result = { data: null, count, error: null };
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

  assert.deepEqual(health.counts, { pending: 3, sending: 2, stale_sending: 1, dead: 1 });
  assert.equal(health.oldest_pending_at, "2026-11-07T10:00:00.000Z");
  assert.equal(health.dead_items.length, 1);
  assert.equal(health.dead_items[0].id, "dead-1");
  assert.equal("recipient_email" in health.dead_items[0], false);
  assert.equal("payload" in health.dead_items[0], false);
  assert.equal(JSON.stringify(health).includes("private@example.test"), false);
  assert.equal(JSON.stringify(health).includes("must-not-leak"), false);
});
