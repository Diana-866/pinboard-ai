const supabase = require("./supabase");
const { httpError } = require("./validate");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVIDENCE_TYPES = new Set([
  "provider_dashboard",
  "provider_support",
  "payment_statement",
  "manual_review",
]);
const SAFE_EVIDENCE_REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9._/#:-]{7,499}$/;

function validateBodyFields(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(422, "Некорректный формат административного запроса");
  }
  const allowed = new Set(["purchase_id", "action_id", "evidence_type", "evidence_reference"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw httpError(422, "Запрос содержит неподдерживаемые поля");
  }
}

function uuid(value, message) {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw httpError(422, message);
  }
  return value.toLowerCase();
}

function evidence(body) {
  const evidenceType = body.evidence_type;
  const evidenceReference = typeof body.evidence_reference === "string"
    ? body.evidence_reference.trim()
    : "";
  const looksLikeBareUrl = /^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i.test(evidenceReference);
  if (!EVIDENCE_TYPES.has(evidenceType) ||
      !SAFE_EVIDENCE_REFERENCE_RE.test(evidenceReference) ||
      evidenceReference.includes("://") ||
      looksLikeBareUrl) {
    throw httpError(422, "Укажите допустимый тип подтверждения и безопасный номер обращения/документа");
  }
  return { evidenceType, evidenceReference };
}

function mapRpcError(error) {
  const message = String((error && error.message) || "");
  if (/administrator privileges required/i.test(message)) {
    return httpError(403, "Доступ запрещён");
  }
  if (/credit purchase not found/i.test(message)) {
    return httpError(404, "Покупка кредитов не найдена");
  }
  if (/invalid credit purchase refund reconciliation evidence/i.test(message)) {
    return httpError(422, "Некорректные параметры подтверждения возврата");
  }
  if (/not awaiting refund reconciliation|action id replay payload mismatch/i.test(message)) {
    return httpError(409, "Покупка уже обработана или действие конфликтует с предыдущей сверкой");
  }
  return httpError(500, "Не удалось записать подтверждение возврата");
}

async function recordProviderRefund(operatorUserId, body = {}) {
  if (!operatorUserId || !UUID_RE.test(String(operatorUserId))) {
    throw httpError(401, "Не авторизован");
  }
  validateBodyFields(body);
  const purchaseId = uuid(body.purchase_id, "Некорректный идентификатор покупки");
  const actionId = uuid(body.action_id, "Некорректный идентификатор действия");
  const proof = evidence(body);

  const { data, error } = await supabase.rpc("admin_record_credit_purchase_refund", {
    p_operator_user_id: String(operatorUserId).toLowerCase(),
    p_purchase_id: purchaseId,
    p_action_id: actionId,
    p_evidence_type: proof.evidenceType,
    p_evidence_reference: proof.evidenceReference,
  });
  if (error) throw mapRpcError(error);
  if (!data) throw httpError(500, "Не удалось получить подтверждение записи возврата");

  return {
    ok: true,
    purchase_id: purchaseId,
    action_id: actionId,
    action_kind: "provider_refund_confirmed",
    recorded_at: data,
  };
}

module.exports = { recordProviderRefund, validateBodyFields, evidence, mapRpcError };
