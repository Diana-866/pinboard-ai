const supabase = require("./supabase");
const { httpError } = require("./validate");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVIDENCE_TYPES = new Set(["provider_dashboard","provider_support","payment_statement","manual_review"]);
const REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9._/#:-]{7,499}$/;

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["purchase_id","action_id","evidence_type","evidence_reference"].includes(key))) {
    throw httpError(422, "Некорректный запрос сверки возврата");
  }
  if (typeof body.purchase_id !== "string" || !UUID_RE.test(body.purchase_id) ||
      typeof body.action_id !== "string" || !UUID_RE.test(body.action_id)) {
    throw httpError(422, "Некорректный идентификатор покупки или действия");
  }
  const reference = typeof body.evidence_reference === "string" ? body.evidence_reference.trim() : "";
  if (!EVIDENCE_TYPES.has(body.evidence_type) || !REFERENCE_RE.test(reference) ||
      reference.includes("://") || /^(www\\.)?([a-z0-9-]+\\.)+[a-z]{2,}(\\/|$)/i.test(reference)) {
    throw httpError(422, "Укажите тип подтверждения и номер документа/обращения провайдера");
  }
  return {
    purchaseId: body.purchase_id.toLowerCase(),
    actionId: body.action_id.toLowerCase(),
    evidenceType: body.evidence_type,
    evidenceReference: reference,
  };
}

function mapError(error) {
  const message = String(error?.message || "");
  if (/administrator privileges required/i.test(message)) return httpError(403, "Доступ запрещён");
  if (/credit purchase not found/i.test(message)) return httpError(404, "Покупка не найдена");
  if (/not awaiting refund reconciliation|action id replay payload mismatch/i.test(message)) return httpError(409, "Покупка изменилась или уже урегулирована");
  if (/invalid credit purchase refund reconciliation evidence/i.test(message)) return httpError(422, "Некорректные параметры сверки");
  return httpError(500, "Не удалось зафиксировать подтверждение возврата");
}

async function recordProviderRefund(operatorUserId, body) {
  if (!operatorUserId) throw httpError(401, "Не авторизован");
  const input = validate(body);
  const { data, error } = await supabase.rpc("admin_record_credit_purchase_refund", {
    p_operator_user_id: operatorUserId,
    p_purchase_id: input.purchaseId,
    p_action_id: input.actionId,
    p_evidence_type: input.evidenceType,
    p_evidence_reference: input.evidenceReference,
  });
  if (error) throw mapError(error);
  if (!data) throw httpError(500, "База данных не подтвердила запись сверки");
  return { ok: true, action: "provider_refund_confirmed", purchase_id: input.purchaseId, recorded_at: data };
}

module.exports = { recordProviderRefund, validate, mapError };
