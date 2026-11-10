const PERSISTED_SCHEDULE_STATUSES = new Set([
  'scheduled', 'publishing', 'published', 'failed', 'unknown', 'cancelled',
]);

/** Preserve known database states; fail closed to "unknown" on schema drift. */
export function parsePersistedScheduleStatus(value: unknown) {
  if (typeof value !== 'string' || !PERSISTED_SCHEDULE_STATUSES.has(value)) {
    // Never turn an unfamiliar state into an active scheduled publication.
    return 'unknown' as const;
  }
  return value as 'scheduled' | 'publishing' | 'published' | 'failed' | 'unknown' | 'cancelled';
}
