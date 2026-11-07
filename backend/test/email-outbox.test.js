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
