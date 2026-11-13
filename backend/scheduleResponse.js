"use strict";

const RESULT_STATUSES = ["published", "failed", "scheduled", "unknown"];
const COUNT_KEYS = ["claimed", "published", "failed", "scheduled", "unknown"];

/**
 * Validate the complete one-item scheduler API contract before a runner
 * treats the request as successful or resets its retry/backoff state.
 */
function isValidScheduleWorkerResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || data.ok !== true) {
    return false;
  }

  if (!COUNT_KEYS.every((key) =>
    Number.isSafeInteger(data[key]) && data[key] >= 0
  )) return false;

  // The backend deliberately enforces one claim per request.
  if (data.claimed > 1 || !Array.isArray(data.results) || data.results.length !== data.claimed) {
    return false;
  }

  const scheduleIds = new Set();
  const resultCounts = { published: 0, failed: 0, scheduled: 0, unknown: 0 };
  for (const item of data.results) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.schedule_id !== "string" ||
      !item.schedule_id.trim() ||
      scheduleIds.has(item.schedule_id) ||
      !RESULT_STATUSES.includes(item.status)
    ) return false;

    scheduleIds.add(item.schedule_id);
    resultCounts[item.status] += 1;
  }

  return RESULT_STATUSES.every((status) => resultCounts[status] === data[status]);
}

module.exports = { isValidScheduleWorkerResponse };
