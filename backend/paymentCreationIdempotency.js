const crypto = require("node:crypto");
const supabase = require("./supabase");
const { httpError } = require("./validate");

const KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;

function paymentRequestFingerprint(kind, productId, currency) {
  return crypto.createHash("sha256")
    .update(JSON.stringify({ kind, productId, currency }))
    .digest("hex");
}

function paymentRequestError(status, code, message) {
  const error = httpError(status, message);
  error.details = { code };
  return error;
}

async function beginPaymentCreation(userId, idempotencyKey, kind, productId, currency) {
  if (typeof idempotencyKey !== "string" || !KEY_RE.test(idempotencyKey)) {
    throw httpError(422, "Для создания платежа требуется корректный Idempotency-Key");
  }

  const fingerprint = paymentRequestFingerprint(kind, productId, currency);
  const { data, error } = await supabase.rpc("begin_payment_creation_request", {
    p_user_id: String(userId),
    p_idempotency_key: idempotencyKey,
    p_request_kind: kind,
    p_request_fingerprint: fingerprint,
  });
  if (error) {
    if (/idempotency key reused with different payment request/i.test(error.message || "")) {
      throw paymentRequestError(
        409,
        "idempotency_key_reused",
        "Ключ идемпотентности уже использован для другого тарифа или пакета. Начните новую попытку оплаты."
      );
    }
    throw error;
  }

  if (data && data.status === "started") return { started: true };
  if (data && data.status === "ready" && data.result) {
    return { started: false, result: data.result };
  }
  if (data && data.status === "creating") {
    throw paymentRequestError(
      409,
      "payment_creation_in_progress",
      "Создание платежа ещё выполняется. Повторите запрос с тем же ключом через несколько секунд."
    );
  }
  if (data && data.status === "unknown") {
    throw paymentRequestError(
      409,
      "payment_outcome_unknown",
      "Платёжный провайдер мог создать счёт, но ответ не был получен. Повторное создание заблокировано до сверки."
    );
  }
  throw paymentRequestError(
    409,
    "payment_request_not_reusable",
    "Предыдущая попытка создания платежа завершилась ошибкой. Для новой попытки создайте новый запрос."
  );
}

async function attachPaymentCreationOrder(userId, idempotencyKey, orderId) {
  const { data, error } = await supabase.rpc("attach_payment_creation_order", {
    p_user_id: String(userId),
    p_idempotency_key: idempotencyKey,
    p_order_id: String(orderId),
  });
  if (error) throw error;
  if (data !== true) throw new Error("payment provider order reference was not attached");
  return true;
}

async function denyUnsentPaymentRecord(table, recordId) {
  if (!["subscriptions", "credit_purchases"].includes(table) || !recordId) {
    throw new Error("invalid unsent payment record reference");
  }
  const { data, error } = await supabase
    .from(table)
    .update({ status: "denied" })
    .eq("id", recordId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data || data.id !== recordId) {
    throw new Error("unsent payment record was not confirmed as denied");
  }
  return true;
}

async function settlePaymentCreationRequest(orderId, kind, localPaymentId, db = supabase) {
  if (typeof orderId !== "string" || !orderId.trim() ||
      !["subscription", "credits"].includes(kind) || !localPaymentId) {
    throw new Error("invalid settled payment identity");
  }
  const { data, error } = await db.rpc("settle_payment_creation_request", {
    p_order_id: orderId,
    p_request_kind: kind,
    p_local_payment_id: localPaymentId,
  });
  if (error) throw error;
  return data === true;
}

async function completePaymentCreation(userId, idempotencyKey, result) {
  const { data, error } = await supabase.rpc("complete_payment_creation_request", {
    p_user_id: String(userId),
    p_idempotency_key: idempotencyKey,
    p_result: result,
  });
  if (error) throw error;
  return data;
}

async function markPaymentCreationUnknown(userId, idempotencyKey, error) {
  const rawCode = String(error && (error.code || error.name) || "provider_outcome_unknown");
  const errorCode = /^[A-Za-z0-9_-]{1,64}$/.test(rawCode) ? rawCode : "provider_outcome_unknown";
  const { error: updateError } = await supabase.rpc("mark_payment_creation_unknown", {
    p_user_id: String(userId),
    p_idempotency_key: idempotencyKey,
    p_error_code: errorCode,
  });
  if (updateError) {
    console.error("[payment-idempotency] не удалось зафиксировать неопределённый исход:", updateError.message);
  }
}

async function failPaymentCreation(userId, idempotencyKey, error) {
  const rawCode = String(error && (error.code || error.name) || "payment_creation_failed");
  const errorCode = /^[A-Za-z0-9_-]{1,64}$/.test(rawCode) ? rawCode : "payment_creation_failed";
  const { error: updateError } = await supabase.rpc("fail_payment_creation_request", {
    p_user_id: String(userId),
    p_idempotency_key: idempotencyKey,
    p_error_code: errorCode,
  });
  if (updateError) {
    console.error("[payment-idempotency] не удалось зафиксировать отказ создания:", updateError.message);
  }
}

module.exports = {
  beginPaymentCreation,
  completePaymentCreation,
  settlePaymentCreationRequest,
  attachPaymentCreationOrder,
  markPaymentCreationUnknown,
  failPaymentCreation,
  denyUnsentPaymentRecord,
  paymentRequestFingerprint,
};
