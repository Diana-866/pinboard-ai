const supabase = require("./supabase");
const { httpError } = require("./validate");

const ALLOWED_STATUSES = new Set(["scheduled", "publishing", "unknown", "failed", "published"]);

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
    .replace(/Bearer\\s+[^\\s,;]+/gi, "Bearer [redacted]")
    .replace(/\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b/g, "[redacted-token]")
    .replace(/(access_token|refresh_token|client_secret|client_id|authorization|api[_-]?key|token)\\s*([=:])\\s*[^\\s,;&]+/gi, "$1$2[redacted]")
    .replace(/([?&](?:access_token|refresh_token|token|key|secret)=)[^&#\\s]+/gi, "$1[redacted]")
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

async function listPinterestSchedules(query = {}, now = Date.now()) {
  const filters = parseFilters(query);
  const { data: schedules, error } = await supabase
    .from("pin_schedules")
    .select("id,user_id,pin_id,pinterest_account_id,pinterest_board_id,pinterest_pin_id,status,scheduled_at,published_at,updated_at,attempts,next_attempt_at,last_error,claim_token")
    .in("status", filters.statuses)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1);
  if (error) throw error;

  const rows = schedules || [];
  const pinIds = [...new Set(rows.map((row) => row.pin_id).filter(Boolean))];
  let attempts = [];
  if (pinIds.length) {
    const { data, error: attemptError } = await supabase
      .from("pinterest_publish_attempts")
      .select("id,user_id,pin_id,pinterest_account_id,pinterest_board_id,pinterest_pin_id,status,retry_safe,attempt_count,updated_at,last_error")
      .in("pin_id", pinIds)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false });
    if (attemptError) throw attemptError;
    attempts = data || [];
  }

  const attemptsByIdentity = new Map();
  for (const attempt of attempts) {
    const key = `${attempt.user_id}:${attempt.pin_id}:${attempt.pinterest_account_id || "legacy"}`;
    // Legacy null-account rows are not covered by the account-scoped unique
    // index. Keep the newest one; the query above orders newest first.
    if (!attemptsByIdentity.has(key)) attemptsByIdentity.set(key, attempt);
  }

  const staleBefore = now - 20 * 60 * 1000;
  const items = rows.map((row) => {
    const attempt = attemptsByIdentity.get(`${row.user_id}:${row.pin_id}:${row.pinterest_account_id || "legacy"}`) || null;
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
      // Discovery is informational only. Reconciliation still validates all
      // evidence, identities, age, and eligibility in its own SQL transaction.
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

module.exports = { listPinterestSchedules, parseFilters };
