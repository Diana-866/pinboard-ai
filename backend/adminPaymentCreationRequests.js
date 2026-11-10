const supabase = require("./supabase");
const { httpError } = require("./validate");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseLimit(value) {
  if (value === undefined || value === null || value === "") return 50;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw httpError(422, "limit должен быть целым числом от 1 до 100");
  }
  return parsed;
}

function safeErrorCode(value) {
  const code = String(value || "");
  return /^[a-zA-Z0-9_-]{1,64}$/.test(code) ? code : null;
}

function serializeRequest(row, now = Date.now()) {
  const updatedAt = new Date(row.updated_at).getTime();
  const ageMinutes = Number.isFinite(updatedAt)
    ? Math.max(0, Math.floor((now - updatedAt) / 60000))
    : null;
  return {
    id: row.id,
    user_id: row.user_id,
    request_kind: row.request_kind,
    status: row.status,
    error_code: safeErrorCode(row.error_code),
    created_at: row.created_at,
    updated_at: row.updated_at,
    age_minutes: ageMinutes,
    requires_provider_reconciliation: row.status === "unknown",
    stale_creation: row.status === "creating" && ageMinutes !== null && ageMinutes >= 2,
  };
}

async function listPaymentCreationRequests(query = {}, now = Date.now(), db = supabase) {
  const limit = parseLimit(query.limit);
  const { data, error } = await db
    .from("payment_creation_requests")
    .select("id, user_id, request_kind, status, error_code, created_at, updated_at")
    .in("status", ["unknown", "creating"])
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const items = (data || []).map((row) => serializeRequest(row, now));
  return {
    read_only: true,
    automatic_reconciliation: false,
    limit,
    count: items.length,
    unknown_count: items.filter((item) => item.status === "unknown").length,
    creating_count: items.filter((item) => item.status === "creating").length,
    stale_creation_count: items.filter((item) => item.stale_creation).length,
    items,
    note: "Неопределённый исход нельзя сбрасывать или повторять автоматически. Сверьте заказ с Prodamus и историю вебхуков.",
  };
}

module.exports = { listPaymentCreationRequests, parseLimit, serializeRequest, safeErrorCode };
