"use strict";

const DEFAULT_STALE_AFTER_MS = 3 * 60 * 1000;
const DEFAULT_RUNNING_TIMEOUT_MS = 20 * 60 * 1000;

function normalizeCounter(value) {
  if (typeof value === "string" && value.trim() === "") return 0;
  const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function summarizePinterestSchedulerHealth(row, now = Date.now(), staleAfterMs = DEFAULT_STALE_AFTER_MS) {
  if (!row || row.status === "never" || !row.last_started_at) {
    return {
      status: "not_seen",
      stale_after_seconds: Math.floor(staleAfterMs / 1000),
      running_timeout_seconds: Math.floor(DEFAULT_RUNNING_TIMEOUT_MS / 1000),
      last_started_age_seconds: null,
      last_completed_age_seconds: null,
    };
  }
  const startedAt = Date.parse(row.last_started_at);
  const completedAt = row.last_completed_at ? Date.parse(row.last_completed_at) : NaN;
  const startedAgeMs = Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : null;
  const completedAgeMs = Number.isFinite(completedAt) ? Math.max(0, now - completedAt) : null;
  const startedAge = startedAgeMs === null ? null : Math.floor(startedAgeMs / 1000);
  const completedAge = completedAgeMs === null ? null : Math.floor(completedAgeMs / 1000);
  const isRunning = row.status === "running";
  const stale = isRunning
    ? startedAgeMs === null || startedAgeMs > DEFAULT_RUNNING_TIMEOUT_MS
    : completedAgeMs === null || completedAgeMs > staleAfterMs;
  const status = stale ? "stale" : isRunning ? "running" : row.status === "failed" ? "failed" : "healthy";
  return {
    status,
    stale_after_seconds: Math.floor(staleAfterMs / 1000),
    running_timeout_seconds: Math.floor(DEFAULT_RUNNING_TIMEOUT_MS / 1000),
    last_started_age_seconds: startedAge,
    last_completed_age_seconds: completedAge,
    last_started_at: row.last_started_at,
    last_completed_at: row.last_completed_at || null,
    last_run_status: row.status,
    counts: {
      claimed: normalizeCounter(row.claimed),
      published: normalizeCounter(row.published),
      failed: normalizeCounter(row.failed),
      scheduled: normalizeCounter(row.scheduled),
      unknown: normalizeCounter(row.unknown),
    },
    last_error_code: row.last_error_code || null,
  };
}

module.exports = { summarizePinterestSchedulerHealth, DEFAULT_STALE_AFTER_MS, DEFAULT_RUNNING_TIMEOUT_MS };
