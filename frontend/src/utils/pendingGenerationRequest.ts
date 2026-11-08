export interface PendingGenerationRequest {
  fingerprint: string;
  idempotencyKey: string;
}

const FINGERPRINT_KEY = 'pinposy_generation_fingerprint';
const IDEMPOTENCY_KEY = 'pinposy_generation_key';
let inMemoryRequest: PendingGenerationRequest | null = null;

function getDefaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read the current generation identity without making browser storage a
 * prerequisite for generation. The in-memory copy supports retries/remounts
 * in this page lifetime when sessionStorage is blocked.
 */
export function readPendingGenerationRequest(
  storage: Pick<Storage, 'getItem'> | undefined = getDefaultStorage(),
): PendingGenerationRequest | null {
  if (storage) {
    try {
      const fingerprint = storage.getItem(FINGERPRINT_KEY);
      const idempotencyKey = storage.getItem(IDEMPOTENCY_KEY);
      if (fingerprint && idempotencyKey) {
        inMemoryRequest = { fingerprint, idempotencyKey };
        return inMemoryRequest;
      }
    } catch {
      // Fall through to the page-lifetime copy.
    }
  }
  return inMemoryRequest ? { ...inMemoryRequest } : null;
}

export function writePendingGenerationRequest(
  fingerprint: string,
  idempotencyKey: string,
  storage: Pick<Storage, 'setItem'> | undefined = getDefaultStorage(),
): boolean {
  if (!fingerprint || !idempotencyKey) return false;
  inMemoryRequest = { fingerprint, idempotencyKey };
  if (!storage) return false;
  try {
    storage.setItem(FINGERPRINT_KEY, fingerprint);
    storage.setItem(IDEMPOTENCY_KEY, idempotencyKey);
    return true;
  } catch {
    // Generation can still proceed; retries remain safe while this page is alive.
    return false;
  }
}

export function clearPendingGenerationRequest(
  storage: Pick<Storage, 'removeItem'> | undefined = getDefaultStorage(),
): void {
  inMemoryRequest = null;
  if (!storage) return;
  try {
    storage.removeItem(FINGERPRINT_KEY);
    storage.removeItem(IDEMPOTENCY_KEY);
  } catch {
    // A stale key is harmless: the next request fingerprint will rotate it.
  }
}
