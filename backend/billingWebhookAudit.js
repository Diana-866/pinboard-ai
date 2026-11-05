const crypto = require("crypto");
const prodamus = require("./prodamus");

function buildWebhookException({ paymentKind, body, expectedAmount = null, reason }) {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const canonical = prodamus.canonicalString(payload);
  const eventHash = crypto.createHash("sha256")
    .update(paymentKind + "\n" + canonical, "utf8")
    .digest("hex");

  return {
    provider: "prodamus",
    payment_kind: paymentKind,
    order_id: payload.order_id == null ? null : String(payload.order_id).slice(0, 200),
    payment_status: payload.payment_status == null ? null : String(payload.payment_status).slice(0, 80),
    received_sum: payload.sum == null ? null : String(payload.sum).slice(0, 80),
    expected_amount: Number.isFinite(Number(expectedAmount)) ? Number(expectedAmount) : null,
    reason: String(reason || "unspecified").slice(0, 120),
    event_hash: eventHash,
  };
}

async function persistWebhookException(supabase, details) {
  const record = buildWebhookException(details);
  const { error } = await supabase.from("billing_webhook_exceptions").insert(record);
  // A repeated delivery of the same signed payload is already durably recorded.
  if (error && error.code !== "23505") throw error;
  return record.event_hash;
}

module.exports = { buildWebhookException, persistWebhookException };
