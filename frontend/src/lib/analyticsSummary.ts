/**
 * Normalisation of `GET /analytics/summary`.
 *
 * The screen must never render a made-up number. A malformed payload throws and
 * the view shows an error state, because silently showing zeros would look like
 * "you have published nothing" and be indistinguishable from real data.
 *
 * Only values the backend actually owns are mapped. Pinterest-side metrics
 * (impressions, saves, clicks) are reported as unavailable by the API, so the
 * view can state that explicitly instead of implying they are zero.
 */

export interface PublicationSummary {
  rangeDays: number;
  generatedAt: string | null;
  publications: { total: number; window: number };
  schedules: {
    scheduledUpcoming: number;
    publishing: number;
    failedWindow: number;
    cancelledWindow: number;
  };
  lastPublishedAt: string | null;
  pinterestMetrics: { available: boolean; reason: string | null };
}

function count(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`analytics.${field} must be a non-negative integer`);
  }
  return value;
}

function isoOrNull(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`analytics.${field} must be an ISO timestamp or null`);
  }
  return new Date(value).toISOString();
}

export function mapPublicationSummary(raw: unknown): PublicationSummary {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('analytics payload must be an object');
  }
  const payload = raw as Record<string, any>;
  const publications = payload.publications;
  const schedules = payload.schedules;
  if (!publications || typeof publications !== 'object' || Array.isArray(publications)) {
    throw new Error('analytics.publications must be an object');
  }
  if (!schedules || typeof schedules !== 'object' || Array.isArray(schedules)) {
    throw new Error('analytics.schedules must be an object');
  }

  const rangeDays = count(payload.range_days, 'range_days');
  if (rangeDays < 1 || rangeDays > 366) {
    throw new Error('analytics.range_days is out of range');
  }
  const metrics = payload.pinterest_metrics;
  if (!metrics || typeof metrics !== 'object' || typeof metrics.available !== 'boolean') {
    throw new Error('analytics.pinterest_metrics must state availability');
  }

  return {
    rangeDays,
    generatedAt: isoOrNull(payload.generated_at, 'generated_at'),
    publications: {
      total: count(publications.total, 'publications.total'),
      window: count(publications.window, 'publications.window'),
    },
    schedules: {
      scheduledUpcoming: count(schedules.scheduled_upcoming, 'schedules.scheduled_upcoming'),
      publishing: count(schedules.publishing, 'schedules.publishing'),
      failedWindow: count(schedules.failed_window, 'schedules.failed_window'),
      cancelledWindow: count(schedules.cancelled_window, 'schedules.cancelled_window'),
    },
    lastPublishedAt: isoOrNull(payload.last_published_at, 'last_published_at'),
    pinterestMetrics: {
      available: metrics.available,
      reason: typeof metrics.reason === 'string' && metrics.reason.trim() ? metrics.reason : null,
    },
  };
}

/**
 * True when the account has no publication activity at all.
 *
 * Section 130. This used to look only at successes and upcoming work, so an account whose window held
 * five *failed* publications - and nothing else - was told "you have not published anything yet". That
 * is the same lie the payload mapper refuses to tell with zeros: the customer's problem is on screen
 * and the screen says there is nothing. Failures, cancellations and a recorded last publication all
 * mean the account has a history, whether or not anything is pending right now.
 */
export function isEmptySummary(summary: PublicationSummary): boolean {
  return summary.publications.total === 0 &&
    summary.schedules.scheduledUpcoming === 0 &&
    summary.schedules.publishing === 0 &&
    summary.schedules.failedWindow === 0 &&
    summary.schedules.cancelledWindow === 0 &&
    summary.lastPublishedAt === null;
}
