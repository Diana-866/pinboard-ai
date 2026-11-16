/**
 * Prevent an async schedule mutation from updating the calendar after the
 * authenticated account changes. Empty identities never authorize a result.
 */
export function isScheduleOwnerCurrent(
  currentOwnerId: string | null | undefined,
  requestOwnerId: string | null | undefined,
): boolean {
  return typeof requestOwnerId === 'string' &&
    requestOwnerId.length > 0 &&
    currentOwnerId === requestOwnerId;
}
