export interface PendingPinDescription {
  pinId: string;
  description: string;
  updatedAt: number;
}

const STORAGE_PREFIX = 'pinposy.pending-pin-description.v1';
const MAX_DESCRIPTION_LENGTH = 500;

function getDefaultStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

const storageKey = (boardId: string, pinId: string): string =>
  `${STORAGE_PREFIX}:${encodeURIComponent(boardId)}:${encodeURIComponent(pinId)}`;

export function readPendingPinDescription(
  boardId: string,
  pinId: string,
  storage: Pick<Storage, 'getItem'> | undefined = getDefaultStorage(),
): PendingPinDescription | null {
  if (!storage || !boardId || !pinId) return null;
  try {
    const raw = storage.getItem(storageKey(boardId, pinId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingPinDescription>;
    if (value.pinId !== pinId || typeof value.description !== 'string' ||
        value.description.length > MAX_DESCRIPTION_LENGTH ||
        typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) return null;
    return { pinId, description: value.description, updatedAt: value.updatedAt };
  } catch {
    return null;
  }
}

export function writePendingPinDescription(
  boardId: string,
  pinId: string,
  description: string,
  storage: Pick<Storage, 'setItem'> | undefined = getDefaultStorage(),
): boolean {
  if (!storage || !boardId || !pinId) return false;
  try {
    storage.setItem(storageKey(boardId, pinId), JSON.stringify({
      pinId,
      description: description.slice(0, MAX_DESCRIPTION_LENGTH),
      updatedAt: Date.now(),
    } satisfies PendingPinDescription));
    return true;
  } catch {
    // Storage can be disabled or full; the server save remains the primary path.
    return false;
  }
}

export function clearPendingPinDescription(
  boardId: string,
  pinId: string,
  storage: Pick<Storage, 'removeItem'> | undefined = getDefaultStorage(),
): void {
  if (!storage || !boardId || !pinId) return;
  try {
    storage.removeItem(storageKey(boardId, pinId));
  } catch {
    // A stale draft is safer than deleting user text when storage is unavailable.
  }
}


/**
 * Remove a recovery draft only when it still contains the exact value that was
 * successfully sent. An older in-flight PATCH must never erase newer typing.
 */
export function clearPendingPinDescriptionIfMatches(
  boardId: string,
  pinId: string,
  savedDescription: string,
  storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined = getDefaultStorage(),
): boolean {
  if (!storage || !boardId || !pinId) return false;
  try {
    const raw = storage.getItem(storageKey(boardId, pinId));
    if (!raw) return false;
    const value = JSON.parse(raw) as Partial<PendingPinDescription>;
    if (value.pinId !== pinId || value.description !== savedDescription) return false;
    storage.removeItem(storageKey(boardId, pinId));
    return true;
  } catch {
    // Keep the recovery copy if storage is unavailable or contains bad data.
    return false;
  }
}
