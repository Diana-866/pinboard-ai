export interface PublishSessionLock {
  ownerId: string;
  sessionId: number;
  requestId: number;
}

export function isCurrentPublishSession(activeOwnerId: string, activeSessionId: number, requestOwnerId: string, requestSessionId: number): boolean {
  return Boolean(requestOwnerId) && activeOwnerId === requestOwnerId && activeSessionId === requestSessionId;
}

export function ownsPublishSessionLock(lock: PublishSessionLock | null, ownerId: string, sessionId: number, requestId: number): boolean {
  return Boolean(lock && lock.ownerId === ownerId && lock.sessionId === sessionId && lock.requestId === requestId);
}

export function hasPublishSessionLock(lock: PublishSessionLock | null, ownerId: string, sessionId: number): boolean {
  return Boolean(lock && lock.ownerId === ownerId && lock.sessionId === sessionId);
}

export function isCurrentPublishPin(activePinId: string, activeGeneration: number, requestPinId: string, requestGeneration: number): boolean {
  return Boolean(requestPinId) && activePinId === requestPinId && activeGeneration === requestGeneration;
}
