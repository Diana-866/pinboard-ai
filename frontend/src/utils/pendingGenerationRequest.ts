export interface PendingGenerationRequest {
  fingerprint: string;
  idempotencyKey: string;
}

const REQUEST_KEY = 'pinposy_generation_request_v1';
const LEGACY_FINGERPRINT_KEY = 'pinposy_generation_fingerprint';
const LEGACY_IDEMPOTENCY_KEY = 'pinposy_generation_key';
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
  // Prefer the current page's value: it remains authoritative if a storage
  // write was rejected after an older legacy key pair had already existed.
  if (inMemoryRequest) return { ...inMemoryRequest };
  if (!storage) return null;
  try {
    const raw = storage.getItem(REQUEST_KEY);
    if (raw) {
      const value = JSON.parse(raw) as Partial<PendingGenerationRequest>;
      if (typeof value.fingerprint === 'string' && value.fingerprint &&
          typeof value.idempotencyKey === 'string' && value.idempotencyKey) {
        inMemoryRequest = {
          fingerprint: value.fingerprint,
          idempotencyKey: value.idempotencyKey,
        };
        return { ...inMemoryRequest };
      }
    }

    // One-time compatibility with sessions created before the combined key.
    const fingerprint = storage.getItem(LEGACY_FINGERPRINT_KEY);
    const idempotencyKey = storage.getItem(LEGACY_IDEMPOTENCY_KEY);
    if (fingerprint && idempotencyKey) {
      inMemoryRequest = { fingerprint, idempotencyKey };
      return { ...inMemoryRequest };
    }
  } catch {
    // Fall through to the page-lifetime copy.
  }
  return null;
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
    // A single storage write avoids pairing a new fingerprint with an old key
    // if the browser rejects one of two consecutive setItem calls.
    storage.setItem(REQUEST_KEY, JSON.stringify(inMemoryRequest));
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
  for (const key of [REQUEST_KEY, LEGACY_FINGERPRINT_KEY, LEGACY_IDEMPOTENCY_KEY]) {
    try {
      storage.removeItem(key);
    } catch {
      // Continue clearing other keys; a stale key is harmless because each
      // new request compares its full fingerprint before reusing an identity.
    }
  }
}
