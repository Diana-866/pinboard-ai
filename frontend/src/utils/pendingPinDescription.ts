export interface PendingPinDescription {
  pinId: string;
  description: string;
  updatedAt: number;
}

const STORAGE_PREFIX = 'pinposy.pending-pin-description.v1';

const storageKey = (boardId: string, pinId: string): string =>
  `${STORAGE_PREFIX}:${encodeURIComponent(boardId)}:${encodeURIComponent(pinId)}`;

export function readPendingPinDescription(
  boardId: string,
  pinId: string,
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined,
): PendingPinDescription | null {
  if (!storage || !boardId || !pinId) return null;
  try {
    const raw = storage.getItem(storageKey(boardId, pinId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingPinDescription>;
    if (value.pinId !== pinId || typeof value.description !== 'string' ||
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
  storage: Pick<Storage, 'setItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined,
): boolean {
  if (!storage || !boardId || !pinId) return false;
  try {
    storage.setItem(storageKey(boardId, pinId), JSON.stringify({
      pinId,
      description,
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
  storage: Pick<Storage, 'removeItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined,
): void {
  if (!storage || !boardId || !pinId) return;
  try {
    storage.removeItem(storageKey(boardId, pinId));
  } catch {
    // A stale draft is safer than deleting user text when storage is unavailable.
  }
}
