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
const MAX_BIGINT = 9223372036854775807n;

function validateBodyFields(body, allowedFields) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(422, "Некорректный формат административного запроса");
  }
  const allowed = new Set(allowedFields);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw httpError(422, "Запрос содержит неподдерживаемые поля");
  }
}

function requestId(value) {
  let normalized;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw httpError(422, "Некорректный идентификатор операции");
    }
    normalized = String(value);
  } else if (typeof value === "string") {
    normalized = value.trim();
  } else {
    throw httpError(422, "Некорректный идентификатор операции");
  }

  if (!/^[1-9][0-9]{0,18}$/.test(normalized) || BigInt(normalized) > MAX_BIGINT) {
    throw httpError(422, "Некорректный идентификатор операции");
  }
  return normalized;
}

function actionId(value) {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw httpError(422, "Некорректный идентификатор действия");
  }
  return value.toLowerCase();
}

function evidence(body) {
  const evidenceType = body && body.evidence_type;
  const evidenceReference = typeof (body && body.evidence_reference) === "string"
    ? body.evidence_reference.trim()
    : "";

  const looksLikeBareUrl = /^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i.test(evidenceReference);
  if (!EVIDENCE_TYPES.has(evidenceType) ||
      !SAFE_EVIDENCE_REFERENCE_RE.test(evidenceReference) ||
      evidenceReference.includes("://") || looksLikeBareUrl) {
    throw httpError(422, "Укажите допустимый тип подтверждения и безопасный номер обращения/документа");
  }

  return { evidenceType, evidenceReference };
}

function mapRpcError(error) {
  const message = String((error && error.message) || "");
  if (/administrator privileges required/i.test(message)) {
    return httpError(403, "Доступ запрещён");
  }
  if (/target request not found|target user not found|generation task not found|generation request not found|regeneration request not found|generation user not found|regeneration user not found/i.test(message)) {
    return httpError(404, "Операция или задача не найдена");
  }
  if (/invalid administrator provider-refund action|invalid provider-refund reconciliation evidence|invalid provider refund reconciliation|invalid finalization action payload|invalid generation reconciliation finalization|invalid regeneration reconciliation finalization/i.test(message)) {
    return httpError(422, "Некорректные параметры административного действия");
  }
  if (/not awaiting reconciliation|not eligible for reconciliation|not reconciled|not finalized by refund reconciliation|all generation tasks must be failed|active credit reservation|credit reservation is not active|logical administrator action already recorded|action id replay payload mismatch|already finalized|changed during lock acquisition/i.test(message)) {
    return httpError(409, "Операция изменилась или больше не доступна для этого действия");
  }
  return httpError(500, "Не удалось выполнить административную операцию");
}

async function invoke(operatorUserId, rpcName, args, response) {
  if (!operatorUserId) throw httpError(401, "Не авторизован");
  const { data, error } = await supabase.rpc(rpcName, {
    p_operator_user_id: operatorUserId,
    ...args,
  });
  if (error) throw mapRpcError(error);
  if (!data) throw httpError(500, "Не удалось получить подтверждение административной операции");
  return {
    ok: true,
    ...response,
    recorded_at: data,
  };
}

async function reconcileGeneration(operatorUserId, body = {}) {
  validateBodyFields(body, ["request_id", "task_index", "provider_refunded", "evidence_type", "evidence_reference", "action_id"]);
  const id = requestId(body.request_id);
  const taskIndex = body.task_index;
  if (!Number.isInteger(taskIndex) || taskIndex < 1 || taskIndex > 10) {
    throw httpError(422, "Некорректный номер задачи генерации");
  }
  if (typeof body.provider_refunded !== "boolean") {
    throw httpError(422, "Необходимо указать подтверждённый статус возврата");
  }
  const proof = evidence(body);
  const idempotencyId = actionId(body.action_id);
  return invoke(operatorUserId, "admin_reconcile_pin_generation_provider_refund", {
    p_request_id: id,
    p_task_index: taskIndex,
    p_provider_refunded: body.provider_refunded,
    p_evidence_type: proof.evidenceType,
    p_evidence_reference: proof.evidenceReference,
    p_action_id: idempotencyId,
  }, {
    action_id: idempotencyId,
    request_id: id,
    request_kind: "generation",
    action_kind: "reconcile_refund",
    task_index: taskIndex,
  });
}

async function reconcileRegeneration(operatorUserId, body = {}) {
  validateBodyFields(body, ["request_id", "provider_refunded", "evidence_type", "evidence_reference", "action_id"]);
  const id = requestId(body.request_id);
  if (typeof body.provider_refunded !== "boolean") {
    throw httpError(422, "Необходимо указать подтверждённый статус возврата");
  }
  const proof = evidence(body);
  const idempotencyId = actionId(body.action_id);
  return invoke(operatorUserId, "admin_reconcile_pin_regeneration_provider_refund", {
    p_request_id: id,
    p_provider_refunded: body.provider_refunded,
    p_evidence_type: proof.evidenceType,
    p_evidence_reference: proof.evidenceReference,
    p_action_id: idempotencyId,
  }, {
    action_id: idempotencyId,
    request_id: id,
    request_kind: "regeneration",
    action_kind: "reconcile_refund",
    task_index: 0,
  });
}

async function finalizeGeneration(operatorUserId, body = {}) {
  validateBodyFields(body, ["request_id", "action_id"]);
  const id = requestId(body.request_id);
  const idempotencyId = actionId(body.action_id);
  return invoke(operatorUserId, "admin_finalize_reconciled_pin_generation_failure", {
    p_request_id: id,
    p_action_id: idempotencyId,
  }, {
    action_id: idempotencyId,
    request_id: id,
    request_kind: "generation",
    action_kind: "finalize_failure",
    task_index: 0,
  });
}

async function finalizeRegeneration(operatorUserId, body = {}) {
  validateBodyFields(body, ["request_id", "action_id"]);
  const id = requestId(body.request_id);
  const idempotencyId = actionId(body.action_id);
  return invoke(operatorUserId, "admin_finalize_reconciled_pin_regeneration_failure", {
    p_request_id: id,
    p_action_id: idempotencyId,
  }, {
    action_id: idempotencyId,
    request_id: id,
    request_kind: "regeneration",
    action_kind: "finalize_failure",
    task_index: 0,
  });
}

module.exports = {
  reconcileGeneration,
  reconcileRegeneration,
  finalizeGeneration,
  finalizeRegeneration,
  requestId,
  actionId,
  validateBodyFields,
  evidence,
  mapRpcError,
};
