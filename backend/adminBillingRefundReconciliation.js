const supabase = require("./supabase");
const { httpError } = require("./validate");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVIDENCE_TYPES = new Set(["provider_dashboard", "provider_support", "payment_statement", "manual_review"]);
const SAFE_REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9._/#:-]{7,499}$/;

function validateBody(body, idField) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(422, "Некорректный формат административного запроса");
  }
  const allowed = new Set([idField, "action_id", "evidence_type", "evidence_reference"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw httpError(422, "Запрос содержит неподдерживаемые поля");
  }
}

function validateUuid(value, message) {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw httpError(422, message);
  return value.toLowerCase();
}

function validateEvidence(body) {
  const type = body.evidence_type;
  const reference = typeof body.evidence_reference === "string" ? body.evidence_reference.trim() : "";
  const bareUrl = /^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i.test(reference);
  if (!EVIDENCE_TYPES.has(type) || !SAFE_REFERENCE_RE.test(reference) ||
      reference.includes("://") || bareUrl) {
    throw httpError(422, "Укажите тип подтверждения и номер возврата/обращения, а не URL");
  }
  return { type, reference };
}

function mapError(error) {
  const message = String(error && error.message || "");
  if (/administrator privileges required/i.test(message)) return httpError(403, "Доступ запрещён");
  if (/credit purchase not found|credit purchase owner not found|subscription not found|subscription user not found/i.test(message)) {
    return httpError(404, "Платёжная запись не найдена");
  }
  if (/invalid .*refund reconciliation evidence/i.test(message)) return httpError(422, "Некорректные параметры подтверждения возврата");
  if (/not awaiting refund reconciliation|action id replay payload mismatch|owner changed|changed during lock acquisition/i.test(message)) {
    return httpError(409, "Платёж уже обработан или действие конфликтует с предыдущей сверкой");
  }
  return httpError(500, "Не удалось записать подтверждение возврата");
}

async function invoke(operatorUserId, rpcName, args, idField, idValue) {
  if (!operatorUserId || !UUID_RE.test(String(operatorUserId))) throw httpError(401, "Не авторизован");
  const proof = validateEvidence(args.body);
  const actionId = validateUuid(args.body.action_id, "Некорректный идентификатор действия");
  const { data, error } = await supabase.rpc(rpcName, {
    p_operator_user_id: String(operatorUserId).toLowerCase(),
    [idField === "purchase_id" ? "p_purchase_id" : "p_subscription_id"]: idValue,
    p_action_id: actionId,
    p_evidence_type: proof.type,
    p_evidence_reference: proof.reference,
  });
  if (error) throw mapError(error);
  if (!data) throw httpError(500, "Не удалось получить подтверждение записи возврата");
  return { ok: true, [idField]: idValue, action_id: actionId, action_kind: "provider_refund_confirmed", recorded_at: data };
}

async function recordProviderRefund(operatorUserId, body = {}) {
  validateBody(body, "purchase_id");
  const purchaseId = validateUuid(body.purchase_id, "Некорректный идентификатор покупки");
  return invoke(operatorUserId, "admin_record_credit_purchase_refund", { body }, "purchase_id", purchaseId);
}

async function recordSubscriptionProviderRefund(operatorUserId, body = {}) {
  validateBody(body, "subscription_id");
  const subscriptionId = validateUuid(body.subscription_id, "Некорректный идентификатор подписки");
  return invoke(operatorUserId, "admin_record_subscription_provider_refund", { body }, "subscription_id", subscriptionId);
}

module.exports = { recordProviderRefund, recordSubscriptionProviderRefund, validateBody, validateUuid, validateEvidence, mapError };
