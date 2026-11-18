const crypto = require("crypto");
const prodamus = require("./prodamus");

function buildWebhookException({ paymentKind, body, expectedAmount = null, reason }) {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  // Prodamus increments `attempt` when it retries delivery of the same payment event.
  // Exclude this transport-only counter so retries share one durable audit fingerprint.
  const fingerprintPayload = { ...payload };
  delete fingerprintPayload.attempt;
  const canonical = prodamus.canonicalString(fingerprintPayload);
  const eventHash = crypto.createHash("sha256")
    .update(paymentKind + "\n" + canonical, "utf8")
    .digest("hex");

  return {
    provider: "prodamus",
    payment_kind: paymentKind,
    order_id: payload.order_id == null ? null : String(payload.order_id).slice(0, 200),
    payment_status: payload.payment_status == null ? null : String(payload.payment_status).slice(0, 80),
    // currency_sum is meaningful only when Prodamus explicitly identifies a
    // non-RUB currency. Without currency metadata, preserve the base sum rather
    // than silently recording an unrelated/ambiguous currency_sum value.
    received_sum: payload.currency != null &&
      String(payload.currency).trim() !== "" &&
      String(payload.currency).trim().toLowerCase() !== "rub" &&
      payload.currency_sum != null && String(payload.currency_sum).trim() !== ""
      ? String(payload.currency_sum).slice(0, 80)
      : payload.sum == null ? null : String(payload.sum).slice(0, 80),
    received_currency: payload.currency == null ? null : String(payload.currency).slice(0, 12).toLowerCase(),
    expected_amount: expectedAmount != null && expectedAmount !== "" && Number.isFinite(Number(expectedAmount))
      ? Number(expectedAmount)
      : null,
    reason: String(reason || "unspecified").slice(0, 120),
    event_hash: eventHash,
  };
}

function isDuplicateWebhookEventHash(error) {
  if (!error || error.code !== "23505") return false;
  const constraint = String(error.constraint || "");
  const message = String(error.message || "");
  const details = String(error.details || "");
  return constraint === "billing_webhook_exceptions_event_hash_key" ||
    /billing_webhook_exceptions_event_hash_key/i.test(message) ||
    details.includes("Key (event_hash)=");
}

async function persistWebhookException(supabase, details) {
  const record = buildWebhookException(details);
  const { error } = await supabase.from("billing_webhook_exceptions").insert(record);
  // Only the event_hash uniqueness fence represents a harmless duplicate
  // delivery. Other unique violations mean the audit row was not persisted.
  if (error && !isDuplicateWebhookEventHash(error)) throw error;
  return record.event_hash;
}

module.exports = { buildWebhookException, persistWebhookException };
