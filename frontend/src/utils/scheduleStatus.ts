const PERSISTED_SCHEDULE_STATUSES = new Set([
  'scheduled', 'publishing', 'published', 'failed', 'unknown', 'cancelled',
]);

/** Preserve known database states; never disguise schema drift as an active schedule. */
export function parsePersistedScheduleStatus(value: unknown) {
  if (typeof value !== 'string' || !PERSISTED_SCHEDULE_STATUSES.has(value)) {
    throw new Error(`Unsupported persisted schedule status: ${String(value)}`);
  }
  return value as 'scheduled' | 'publishing' | 'published' | 'failed' | 'unknown' | 'cancelled';
}
