export interface PublishSessionLock {
  ownerId: string;
  requestId: number;
}

export function isCurrentPublishOwner(activeOwnerId: string, requestOwnerId: string): boolean {
  return Boolean(requestOwnerId) && activeOwnerId === requestOwnerId;
}

export function ownsPublishSessionLock(
  lock: PublishSessionLock | null,
  ownerId: string,
  requestId: number,
): boolean {
  return Boolean(lock && lock.ownerId === ownerId && lock.requestId === requestId);
}

export function hasPublishSessionLock(lock: PublishSessionLock | null, ownerId: string): boolean {
  return Boolean(lock && lock.ownerId === ownerId);
}
