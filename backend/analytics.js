"use strict";

// Publication analytics built only from data PinPosy actually owns.
//
// Pinterest-side metrics (impressions, saves, outbound clicks) are not collected
// today: no Pinterest analytics API call exists in this codebase. Reporting them
// would be fabricated data, so this module deliberately returns only counts of
// our own publication/schedule rows and states that provider metrics are not
// available.
const supabase = require("./supabase");
const { logError } = require("./safeLogger");

const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysAgo(days, now = Date.now()) {
  return new Date(now - days * DAY_MS).toISOString();
}

// Supabase returns `count: null` without an error when a head request could not
// be answered as documented. Treat that as a failure instead of "zero rows".
function normalizeCount(count, label) {
  if (!Number.isSafeInteger(count) || count < 0) {
    const error = new Error(`analytics ${label} count response is invalid`);
    error.code = "invalid_analytics_count";
    throw error;
  }
  return count;
}

async function countRows(db, table, label, applyFilters) {
  const base = db.from(table).select("id", { count: "exact", head: true });
  const query = typeof applyFilters === "function" ? applyFilters(base) : base;
  const { count, error } = await query;
  if (error) throw error;
  return normalizeCount(count, label);
}

/**
 * @param {string} userId authenticated owner; every query is scoped to it.
 * @param {object} db Supabase-like client (injectable for tests).
 * @param {number} now injectable clock.
 */
async function getPublicationSummary(userId, db = supabase, now = Date.now()) {
  const ownerId = String(userId == null ? "" : userId).trim();
  if (!ownerId) {
    const error = new Error("analytics requires an owner id");
    error.code = "invalid_owner_id";
    throw error;
  }
  const since = isoDaysAgo(WINDOW_DAYS, now);

  const [
    publishedTotal,
    publishedWindow,
    scheduledUpcoming,
    publishingNow,
    failedWindow,
    cancelledWindow,
  ] = await Promise.all([
    countRows(db, "pinterest_publications", "published_total", (q) => q.eq("user_id", ownerId)),
    countRows(db, "pinterest_publications", "published_window", (q) =>
      q.eq("user_id", ownerId).gte("created_at", since)),
    countRows(db, "pin_schedules", "scheduled_upcoming", (q) =>
      q.eq("user_id", ownerId).eq("status", "scheduled").gte("scheduled_at", new Date(now).toISOString())),
    countRows(db, "pin_schedules", "publishing_now", (q) =>
      q.eq("user_id", ownerId).eq("status", "publishing")),
    countRows(db, "pin_schedules", "failed_window", (q) =>
      q.eq("user_id", ownerId).eq("status", "failed").gte("updated_at", since)),
    countRows(db, "pin_schedules", "cancelled_window", (q) =>
      q.eq("user_id", ownerId).eq("status", "cancelled").gte("updated_at", since)),
  ]);

  // The most recent successful publication timestamp is the only per-row read,
  // bounded to a single row.
  let lastPublishedAt = null;
  const lastPublished = await db
    .from("pin_schedules")
    .select("published_at")
    .eq("user_id", ownerId)
    .eq("status", "published")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1);
  if (lastPublished && lastPublished.error) throw lastPublished.error;
  const rows = lastPublished && lastPublished.data;
  if (rows != null && !Array.isArray(rows)) {
    const error = new Error("analytics last publication response is not an array");
    error.code = "invalid_analytics_rows";
    throw error;
  }
  if (Array.isArray(rows) && rows.length > 1) {
    const error = new Error("analytics last publication response is not bounded");
    error.code = "invalid_analytics_rows";
    throw error;
  }
  const candidate = Array.isArray(rows) && rows[0] ? rows[0].published_at : null;
  if (typeof candidate === "string" && Number.isFinite(Date.parse(candidate))) {
    lastPublishedAt = new Date(candidate).toISOString();
  }

  return {
    range_days: WINDOW_DAYS,
    generated_at: new Date(now).toISOString(),
    publications: {
      total: publishedTotal,
      window: publishedWindow,
    },
    schedules: {
      scheduled_upcoming: scheduledUpcoming,
      publishing: publishingNow,
      failed_window: failedWindow,
      cancelled_window: cancelledWindow,
    },
    last_published_at: lastPublishedAt,
    // Explicit, machine-readable statement that provider metrics are absent.
    pinterest_metrics: {
      available: false,
      reason: "not_collected",
    },
  };
}

async function getPublicationSummaryOrUnavailable(userId, db = supabase, now = Date.now()) {
  try {
    return await getPublicationSummary(userId, db, now);
  } catch (error) {
    logError("analytics.event_001", error);
    const unavailable = new Error("Аналитика публикаций временно недоступна — попробуйте позже");
    unavailable.httpStatus = 503;
    throw unavailable;
  }
}

module.exports = {
  WINDOW_DAYS,
  getPublicationSummary,
  getPublicationSummaryOrUnavailable,
  normalizeCount,
};
