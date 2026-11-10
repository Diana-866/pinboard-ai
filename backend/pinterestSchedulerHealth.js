"use strict";

const DEFAULT_STALE_AFTER_MS = 3 * 60 * 1000;

function summarizePinterestSchedulerHealth(row, now = Date.now(), staleAfterMs = DEFAULT_STALE_AFTER_MS) {
  if (!row || row.status === "never" || !row.last_started_at) {
    return { status: "not_seen", stale_after_seconds: Math.floor(staleAfterMs / 1000), last_started_age_seconds: null, last_completed_age_seconds: null };
  }
  const startedAt = Date.parse(row.last_started_at);
  const completedAt = row.last_completed_at ? Date.parse(row.last_completed_at) : NaN;
  const startedAge = Number.isFinite(startedAt) ? Math.max(0, Math.floor((now - startedAt) / 1000)) : null;
  const completedAge = Number.isFinite(completedAt) ? Math.max(0, Math.floor((now - completedAt) / 1000)) : null;
  const stale = startedAge === null || startedAge > Math.floor(staleAfterMs / 1000);
  const status = stale ? "stale" : row.status === "running" ? "running" : row.status === "failed" ? "failed" : "healthy";
  return {
    status,
    stale_after_seconds: Math.floor(staleAfterMs / 1000),
    last_started_age_seconds: startedAge,
    last_completed_age_seconds: completedAge,
    last_started_at: row.last_started_at,
    last_completed_at: row.last_completed_at || null,
    last_run_status: row.status,
    counts: {
      claimed: Number(row.claimed) || 0,
      published: Number(row.published) || 0,
      failed: Number(row.failed) || 0,
      scheduled: Number(row.scheduled) || 0,
      unknown: Number(row.unknown) || 0,
    },
    last_error_code: row.last_error_code || null,
  };
}

module.exports = { summarizePinterestSchedulerHealth, DEFAULT_STALE_AFTER_MS };
