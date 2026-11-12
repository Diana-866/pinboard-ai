const test = require("node:test");
const assert = require("node:assert/strict");

const supabasePath = require.resolve("../supabase");
const modulePath = require.resolve("../adminFinancialOperations");
const oldTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const fixtures = {
  pin_generation_requests: [
    { id: 11, user_id: "private-user-1", idempotency_key: "private-generation-key", status: "processing", error_code: null, created_at: oldTimestamp, updated_at: oldTimestamp },
  ],
  pin_regeneration_requests: [
    { id: 21, user_id: "private-user-2", idempotency_key: "private-regeneration-key", status: "processing", provider_status: "failed", provider_refunded: null, provider_reconciled_at: null, created_at: oldTimestamp, updated_at: oldTimestamp },
  ],
  pin_generation_credit_reservations: [
    { id: 31, user_id: "private-user-1", idempotency_key: "private-generation-key", amount: 40, status: "reserved", created_at: oldTimestamp, updated_at: oldTimestamp },
    { id: 32, user_id: "orphan-user", idempotency_key: "private-orphan-key", amount: 15, status: "reserved", created_at: oldTimestamp, updated_at: oldTimestamp },
  ],
  pin_generation_tasks: [
    { generation_request_id: 11, status: "failed", provider_outcome_status: "failed", provider_refunded: false, provider_reconciled_at: oldTimestamp },
  ],
  credit_purchases: [
    { id: 41, status: "paid_uncredited", amount: 190, currency: "rub", provider_payment_id: "ppc-41", paid_at: oldTimestamp, created_at: oldTimestamp, user_id: "private-credit-user" },
  ],
  subscriptions: [
    { id: 51, status: "paid_unactivated", amount: 790, currency: "rub", provider_paid_at: oldTimestamp, provider_refunded_at: null, created_at: oldTimestamp, user_id: "private-subscription-user" },
  ],
};

const supabaseMock = {
  from(table) {
    const query = {
      select() { return this; },
      eq() { return this; },
      is() { return this; },
      lt() { return this; },
      order() { return this; },
      limit() { return this; },
      in(column, values) {
        this.filterColumn = column;
        this.filterValues = values;
        return this;
      },
      then(resolve, reject) {
        let data = fixtures[table] || [];
        if (this.filterColumn) data = data.filter((row) => this.filterValues.includes(row[this.filterColumn]));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
};

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseMock,
};
delete require.cache[modulePath];
const { getFinancialOperationsQueue, summarizeGenerationTasks, clampInteger } = require("../adminFinancialOperations");

test("read-only queue classifies unresolved provider outcomes and stale reservations", async () => {
  const result = await getFinancialOperationsQueue({ olderThanMinutes: 30, limit: 50 });

  assert.equal(result.read_only, true);
  assert.equal(result.generation[0].reason, "reconciled_failure_awaiting_finalization");
  assert.equal(result.regeneration[0].reason, "provider_refund_fact_unresolved");
  assert.equal(result.reservations[0].reason, "old_active_reservation_requires_request_review");
  assert.equal(result.reservations[1].reason, "reservation_without_matching_request_review");
  assert.equal(result.reservations[0].operation, "generation");
  assert.equal(result.reservations[1].operation, "unmatched");
  assert.equal(result.payment_reconciliation.length, 2);
  assert.equal(result.payment_reconciliation[0].reason, "paid_credit_requires_fulfillment_or_refund");
  assert.equal(result.payment_reconciliation[0].provider_order_id, "ppc-41");
  assert.equal(result.payment_reconciliation[1].reason, "paid_subscription_requires_entitlement_or_refund");
  assert.equal(result.counts.payment_reconciliation, 2);

  const serialized = JSON.stringify(result);
  for (const secret of ["private-user", "private-generation-key", "private-regeneration-key", "private-orphan-key", "private-credit-user", "private-subscription-user"]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(serialized.includes("provider_task_id"), false);
  assert.equal(serialized.includes("claim_token"), false);
});

test("task summary does not infer a refund when the provider refund fact is absent", () => {
  const summary = summarizeGenerationTasks([
    { status: "failed", provider_outcome_status: "failed", provider_refunded: null, provider_reconciled_at: null },
  ]);
  assert.equal(summary.reason, "provider_refund_fact_unresolved");
});

test("query parameter clamps are bounded and deterministic", () => {
  assert.equal(clampInteger("999999", 50, 1, 100), 100);
  assert.equal(clampInteger("-10", 50, 1, 100), 1);
  assert.equal(clampInteger("not-a-number", 50, 1, 100), 50);
});
