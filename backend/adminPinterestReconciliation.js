const supabase = require("./supabase");
const { httpError } = require("./validate");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVIDENCE_TYPES = new Set([
  "pinterest_dashboard",
  "pinterest_api",
  "support_confirmation",
]);
const SAFE_REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9._/#:-]{7,199}$/;

function uuid(value, label) {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw httpError(422, `Некорректный ${label}`);
  }
  return value.toLowerCase();
}

function boundedRemoteId(value, label) {
  if (typeof value !== "string") throw httpError(422, `Некорректный ${label}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw httpError(422, `Некорректный ${label}`);
  }
  return normalized;
}

function evidence(body) {
  const evidenceType = body.evidence_type;
  const evidenceReference = typeof body.evidence_reference === "string"
    ? body.evidence_reference.trim()
    : "";
  const looksLikeBareUrl = /^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i.test(evidenceReference);
  if (!EVIDENCE_TYPES.has(evidenceType) ||
      !SAFE_REFERENCE_RE.test(evidenceReference) ||
      evidenceReference.includes("://") ||
      looksLikeBareUrl) {
    throw httpError(422, "Укажите тип подтверждения и безопасный номер обращения/записи");
  }
  return { evidenceType, evidenceReference };
}

function mapRpcError(error) {
  const message = String((error && error.message) || "");
  const code = String((error && error.code) || "");
  // Concurrent operators may race on the unique schedule/action constraints.
  // The database rejects the duplicate safely; report a conflict, not a server
  // failure that could encourage blind retries or duplicate operator actions.
  if (code === "23505" || code === "40001" ||
      /duplicate key value violates unique constraint|action id replay payload mismatch/i.test(message)) {
    return httpError(409, "Эта публикация уже сверяется или данные действия отличаются от ранее принятого запроса");
  }
  if (/administrator privileges required/i.test(message)) {
    return httpError(403, "Доступ запрещён");
  }
  if (/schedule not found|account not found|schedule owner not found/i.test(message)) {
    return httpError(404, "Публикация или аккаунт не найдены");
  }
  if (/invalid Pinterest reconciliation payload/i.test(message)) {
    return httpError(422, "Некорректные параметры сверки публикации");
  }
  if (/not eligible for reconciliation|conflicting remote Pinterest publication identity|legacy account mapping|ownership mismatch|changed during reconciliation/i.test(message)) {
    return httpError(409, "Публикация изменилась или не подходит для безопасной сверки");
  }
  return httpError(500, "Не удалось выполнить сверку публикации");
}

async function reconcileUnknownPublication(operatorUserId, body = {}) {
  if (!operatorUserId) throw httpError(401, "Не авторизован");
  const scheduleId = uuid(body.schedule_id, "идентификатор расписания");
  const pinterestPinId = boundedRemoteId(body.pinterest_pin_id, "Pinterest Pin ID");
  const pinterestBoardId = boundedRemoteId(body.pinterest_board_id, "Pinterest Board ID");
  const proof = evidence(body);
  const actionId = uuid(body.action_id, "идентификатор действия");

  const { data, error } = await supabase.rpc("admin_reconcile_pinterest_unknown_publication", {
    p_operator_user_id: operatorUserId,
    p_schedule_id: scheduleId,
    p_pinterest_pin_id: pinterestPinId,
    p_pinterest_board_id: pinterestBoardId,
    p_evidence_type: proof.evidenceType,
    p_evidence_reference: proof.evidenceReference,
    p_action_id: actionId,
  });
  if (error) throw mapRpcError(error);
  if (!data) throw httpError(500, "Не удалось получить подтверждение сверки публикации");

  return {
    ok: true,
    action_id: actionId,
    schedule_id: scheduleId,
    status: "published",
    recorded_at: data,
  };
}

module.exports = {
  reconcileUnknownPublication,
  uuid,
  boundedRemoteId,
  evidence,
  mapRpcError,
};
