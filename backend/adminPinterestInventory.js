const supabase = require("./supabase");
const { httpError } = require("./validate");

const ALLOWED_STATUSES = new Set(["scheduled", "publishing", "unknown", "failed", "published"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBoundedInt(value, fallback, min, max, label) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw httpError(422, `Некорректный параметр ${label}`);
  }
  return parsed;
}

function sanitizeOperationalError(value) {
  if (value === null || value === undefined) return null;
  return String(value)
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted-token]")
    .replace(/(authorization)\s*([=:])\s*(?!Bearer \[redacted\])[^\s,;&]+/gi, "$1$2[redacted]")
    .replace(/(access_token|refresh_token|client_secret|client_id|api[_-]?key|token)\s*([=:])\s*[^\s,;&]+/gi, "$1$2[redacted]")
    .replace(/([?&](?:access_token|refresh_token|token|key|secret)=)[^&#\s]+/gi, "$1[redacted]")
    .slice(0, 320);
}

function parseFilters(query = {}) {
  const limit = parseBoundedInt(query.limit, 50, 1, 100, "limit");
  const offset = parseBoundedInt(query.offset, 0, 0, 10000, "offset");
  const statuses = query.status === undefined
    ? ["scheduled", "publishing", "unknown"]
    : String(query.status).split(",").map((value) => value.trim()).filter(Boolean);
  if (!statuses.length || statuses.some((status) => !ALLOWED_STATUSES.has(status))) {
    throw httpError(422, "Некорректный фильтр статуса Pinterest");
  }
  return { limit, offset, statuses: [...new Set(statuses)] };
}

async function listPinterestSchedules(query = {}, now = Date.now(), operatorUserId) {
  const filters = parseFilters(query);
  if (typeof operatorUserId !== "string" || !UUID_RE.test(operatorUserId)) {
    throw httpError(401, "Не авторизован");
  }

  // The SECURITY DEFINER RPC re-checks admin status and selects only the
  // newest attempt for each schedule in PostgreSQL. Never fetch the full
  // attempt journal into Node memory for a paginated schedule page.
  const { data, error } = await supabase.rpc("admin_list_pinterest_schedule_inventory", {
    p_operator_user_id: operatorUserId,
    p_statuses: filters.statuses,
    p_limit: filters.limit,
    p_offset: filters.offset,
  });
  if (error) {
    if (/administrator privileges required/i.test(String(error.message || ""))) {
      throw httpError(403, "Доступ запрещён");
    }
    throw error;
  }
  if (!Array.isArray(data)) throw httpError(500, "Не удалось загрузить очередь Pinterest");

  const staleBefore = now - 20 * 60 * 1000;
  const items = data.map((row) => {
    const attempt = row.attempt || null;
    let category = "normal";
    if (row.status === "unknown") category = "unknown";
    else if (row.status === "publishing" && Date.parse(row.updated_at) <= staleBefore) category = "stale_publishing";
    else if (row.status === "scheduled" &&
      Date.parse(row.scheduled_at) <= now &&
      (!row.next_attempt_at || Date.parse(row.next_attempt_at) <= now)) category = "overdue_scheduled";

    return {
      schedule_id: row.id,
      pin_id: row.pin_id,
      pinterest_account_id: row.pinterest_account_id,
      pinterest_account: row.pinterest_account && typeof row.pinterest_account === "object" ? {
        username: typeof row.pinterest_account.username === "string" ? row.pinterest_account.username : null,
        pinterest_user_id: typeof row.pinterest_account.pinterest_user_id === "string" ? row.pinterest_account.pinterest_user_id : null,
        connected: row.pinterest_account.connected === true,
      } : null,
      pinterest_board_id: row.pinterest_board_id,
      pinterest_pin_id: row.pinterest_pin_id,
      status: row.status,
      scheduled_at: row.scheduled_at,
      published_at: row.published_at,
      updated_at: row.updated_at,
      attempts: row.attempts,
      next_attempt_at: row.next_attempt_at,
      last_error: sanitizeOperationalError(row.last_error),
      claim_present: Boolean(row.claim_token),
      category,
      attempt: attempt ? {
        status: attempt.status,
        retry_safe: attempt.retry_safe,
        attempt_count: attempt.attempt_count,
        updated_at: attempt.updated_at,
        last_error: sanitizeOperationalError(attempt.last_error),
        pinterest_pin_id: attempt.pinterest_pin_id,
        pinterest_board_id: attempt.pinterest_board_id,
      } : null,
      actionable_reconciliation: row.status === "unknown" &&
        !row.claim_token &&
        Date.parse(row.updated_at) <= staleBefore &&
        Boolean(attempt &&
          ["unknown", "processing"].includes(attempt.status) &&
          attempt.retry_safe === false &&
          Date.parse(attempt.updated_at) <= staleBefore &&
          attempt.pinterest_board_id === row.pinterest_board_id &&
          (!row.pinterest_pin_id || row.pinterest_pin_id === attempt.pinterest_pin_id)),
    };
  });

  return {
    limit: filters.limit,
    offset: filters.offset,
    count: items.length,
    items,
    read_only: true,
  };
}

module.exports = { listPinterestSchedules, parseFilters, sanitizeOperationalError };
