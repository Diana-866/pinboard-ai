"use strict";

const supabase = require("./supabase");
const { httpError } = require("./validate");

/**
 * Read-only operator view of the account-deletion pipeline.
 *
 * The worker reports a job as blocked once its attempts are exhausted, but that only
 * reaches the structured log. A deletion that stops progressing is a legal commitment
 * with a deadline, so the state has to be observable without reading logs: this module
 * answers "is anything stuck, for how long, and at which step".
 *
 * Privacy: only identifiers, states, counters and safe error codes are returned. No
 * email address, token, invite payload or content is read, and the queries ask for
 * explicit columns so a future PII column cannot be dragged in by select("*").
 */

const JOB_STATUSES = ["pending", "retry_wait", "running", "succeeded", "blocked"];
const REQUEST_STATES = ["pending", "completed", "canceled"];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STEP_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

function parseLimit(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw httpError(422, "Некорректный параметр limit");
  }
  return parsed;
}

/** A head count that answers with anything but a non-negative integer is a failure, not
 *  a zero: an unreadable queue must never look like an empty one. */
function normalizeCount(count, label) {
  if (!Number.isSafeInteger(count) || count < 0) {
    const error = new Error(`account deletion ${label} count response is invalid`);
    error.code = "invalid_deletion_inventory_count";
    throw error;
  }
  return count;
}

async function countByStatus(db, table, column, value) {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) throw error;
  return normalizeCount(count, `${table}.${column}=${value}`);
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function ageMinutes(timestamp, nowMs) {
  const parsed = Date.parse(String(timestamp || ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / 60000));
}

function safeErrorCode(value) {
  if (typeof value !== "string" || !/^[a-z0-9_]{1,64}$/.test(value)) return null;
  return value;
}

async function getAccountDeletionInventory(query = {}, db = supabase, now = Date.now()) {
  const limit = parseLimit(query.limit);

  const requestCounts = {};
  for (const state of REQUEST_STATES) {
    requestCounts[state] = await countByStatus(db, "account_deletion_requests", "state", state);
  }

  const jobCounts = {};
  for (const status of JOB_STATUSES) {
    jobCounts[status] = await countByStatus(db, "account_deletion_jobs", "status", status);
  }

  const { data: oldestPending, error: oldestError } = await db
    .from("account_deletion_requests")
    .select("id, requested_at")
    .eq("state", "pending")
    .order("requested_at", { ascending: true })
    .limit(1);
  if (oldestError) throw oldestError;
  if (!Array.isArray(oldestPending)) {
    throw new Error("account deletion inventory oldest request response is not an array");
  }
  const oldest = oldestPending[0] || null;
  if (oldest && (typeof oldest !== "object" || Array.isArray(oldest) ||
      typeof oldest.id !== "string" || !UUID_RE.test(oldest.id) ||
      !validTimestamp(oldest.requested_at))) {
    throw new Error("account deletion inventory oldest request row is invalid");
  }

  // Blocked and long-running jobs are the ones that need a person.
  const { data: needingAttention, error: attentionError } = await db
    .from("account_deletion_jobs")
    .select("id, request_id, step_key, status, attempts, safe_error_code, next_attempt_at, updated_at")
    .in("status", ["blocked", "retry_wait", "running"])
    .order("updated_at", { ascending: true })
    .limit(limit + 1);
  if (attentionError) throw attentionError;
  if (!Array.isArray(needingAttention)) {
    throw new Error("account deletion inventory job response is not an array");
  }

  const attentionTruncated = needingAttention.length > limit;
  const visibleJobs = needingAttention.slice(0, limit);
  const jobs = visibleJobs.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.id !== "string" || !UUID_RE.test(row.id) ||
        typeof row.request_id !== "string" || !UUID_RE.test(row.request_id) ||
        typeof row.step_key !== "string" || !STEP_KEY_RE.test(row.step_key) ||
        !JOB_STATUSES.includes(row.status) ||
        !Number.isSafeInteger(row.attempts) || row.attempts < 0 ||
        !validTimestamp(row.updated_at) ||
        (row.next_attempt_at != null && !validTimestamp(row.next_attempt_at))) {
      throw new Error("account deletion inventory job row is invalid");
    }
    return {
      job_id: row.id.toLowerCase(),
      request_id: row.request_id.toLowerCase(),
      step_key: row.step_key,
      status: row.status,
      attempts: row.attempts,
      error_code: safeErrorCode(row.safe_error_code),
      next_attempt_at: row.next_attempt_at || null,
      updated_at: row.updated_at,
      age_minutes: ageMinutes(row.updated_at, now),
    };
  });

  return {
    generated_at: new Date(now).toISOString(),
    requests: requestCounts,
    jobs: jobCounts,
    oldest_pending_requested_at: oldest ? oldest.requested_at || null : null,
    oldest_pending_age_minutes: oldest ? ageMinutes(oldest.requested_at, now) : null,
    requiring_attention: jobs,
    requiring_attention_truncated: attentionTruncated,
    note: "Read-only. A blocked job will not retry on its own; a running job only moves when its lease expires.",
  };
}

module.exports = { getAccountDeletionInventory, parseLimit, normalizeCount, JOB_STATUSES, REQUEST_STATES };
