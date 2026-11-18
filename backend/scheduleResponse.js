"use strict";

const RESULT_STATUSES = ["published", "failed", "scheduled", "unknown"];
const COUNT_KEYS = ["claimed", "published", "failed", "scheduled", "unknown"];

/** Validate the one-item scheduler API contract before a runner reports success. */
function isValidScheduleWorkerResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || data.ok !== true) return false;
  if (!COUNT_KEYS.every((key) => Number.isSafeInteger(data[key]) && data[key] >= 0)) return false;
  if (data.claimed > 1 || !Array.isArray(data.results) || data.results.length !== data.claimed) return false;

  const scheduleIds = new Set();
  const resultCounts = { published: 0, failed: 0, scheduled: 0, unknown: 0 };
  for (const item of data.results) {
    if (!item || typeof item !== "object" ||
        typeof item.schedule_id !== "string" || !item.schedule_id.trim() ||
        scheduleIds.has(item.schedule_id) || !RESULT_STATUSES.includes(item.status)) return false;
    scheduleIds.add(item.schedule_id);
    resultCounts[item.status] += 1;
  }
  return RESULT_STATUSES.every((status) => resultCounts[status] === data[status]);
}

/**
 * A successful empty claim is an empty array. Null/malformed RPC payloads
 * must not be interpreted as an empty queue, and every claimed row must carry
 * the complete identity required by the publication journal and fencing.
 */
function isValidClaimedScheduleRows(rows, limit = 1) {
  if (!Array.isArray(rows) || !Number.isSafeInteger(limit) || limit < 0 || rows.length > limit) return false;
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const identity = ["id", "user_id", "pin_id", "pinterest_account_id", "pinterest_board_id", "claim_token"];
    if (!identity.every((key) => typeof row[key] === "string" && row[key].trim().length > 0)) return false;
    if (ids.has(row.id)) return false;
    ids.add(row.id);
  }
  return true;
}

module.exports = { isValidScheduleWorkerResponse, isValidClaimedScheduleRows };
