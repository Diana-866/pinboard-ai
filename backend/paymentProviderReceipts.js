const crypto = require("crypto");
const prodamus = require("./prodamus");

const ALLOWED_CURRENCIES = new Set(["rub", "usd", "eur", "kzt"]);

function buildProviderReceipt({ paymentKind, body }) {
  if (!["subscription", "credits"].includes(paymentKind)) {
    throw new TypeError("paymentKind must be subscription or credits");
  }
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const fingerprintPayload = { ...payload };
  // Provider retry counters and signature aliases are transport metadata, not
  // part of the signed payment event identity.
  delete fingerprintPayload.attempt;
  delete fingerprintPayload.Sign;
  delete fingerprintPayload.sign;

  const eventHash = crypto.createHash("sha256")
    .update(paymentKind + "\n" + prodamus.canonicalString(fingerprintPayload), "utf8")
    .digest("hex");

  const rawCurrency = payload.currency == null ? "" : String(payload.currency).trim().toLowerCase();
  const receivedCurrency = rawCurrency && ALLOWED_CURRENCIES.has(rawCurrency)
    ? rawCurrency
    : null;
  const hasCurrency = rawCurrency !== "";
  const rawAmount = hasCurrency
    ? receivedCurrency === "rub" ? payload.sum
      : receivedCurrency ? payload.currency_sum : null
    : payload.sum;
  const parsedAmount = rawAmount == null || String(rawAmount).trim() === ""
    ? NaN
    : Number(rawAmount);
  const receivedAmount = Number.isFinite(parsedAmount) &&
    parsedAmount > 0 && parsedAmount <= 9999999999.99
    ? Math.round((parsedAmount + Number.EPSILON) * 100) / 100
    : null;

  const rawOrderId = payload.order_id == null ? "" : String(payload.order_id).trim();
  const normalizedStatus = prodamus.normalizePaymentStatus(payload.payment_status);
  return {
    payment_kind: paymentKind,
    provider_order_id: rawOrderId && rawOrderId.length <= 200 ? rawOrderId : null,
    provider_status: normalizedStatus || "unrecognized",
    received_amount: receivedAmount,
    received_currency: receivedCurrency,
    event_hash: eventHash,
  };
}

async function persistProviderReceipt(supabase, details) {
  const record = buildProviderReceipt(details);
  const { data, error } = await supabase.rpc("record_prodamus_payment_receipt", {
    p_payment_kind: record.payment_kind,
    p_provider_order_id: record.provider_order_id,
    p_provider_status: record.provider_status,
    p_received_amount: record.received_amount,
    p_received_currency: record.received_currency,
    p_event_hash: record.event_hash,
  });
  if (error) throw error;
  const receiptId = typeof data === "string" ? data : data && (data.id || data.receipt_id);
  if (!receiptId) throw new Error("provider receipt RPC returned no receipt id");
  return { receiptId, record };
}

async function setProviderDecision(supabase, {
  receiptId,
  decision,
  reasonCode = null,
  paymentKind = null,
  paymentId = null,
  userId = null,
}) {
  if (decision === "granted") {
    throw new TypeError("granted decisions must be recorded by atomic fulfillment RPCs");
  }
  const { data, error } = await supabase.rpc("set_prodamus_payment_decision", {
    p_receipt_id: receiptId,
    p_decision: decision,
    p_safe_reason_code: reasonCode,
    p_local_payment_kind: paymentKind,
    p_local_payment_id: paymentId,
    p_user_id: userId == null ? null : String(userId),
  });
  if (error) throw error;
  if (data !== true) throw new Error("provider decision RPC did not confirm persistence");
  return true;
}

module.exports = {
  buildProviderReceipt,
  persistProviderReceipt,
  setProviderDecision,
};
