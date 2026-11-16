/**
 * Notification history is browser-local but must be isolated by account.
 */
export function buildNotificationStorageKey(ownerId: string): string {
  if (typeof ownerId !== 'string' || !ownerId.trim()) {
    throw new Error('Notification storage requires an authenticated owner');
  }
  return `pinposy_notifications:${encodeURIComponent(ownerId)}`;
}
