export interface PendingGenerationRequest {
  fingerprint: string;
  idempotencyKey: string;
}

const REQUEST_KEY = 'pinposy_generation_request_v1';
const LEGACY_FINGERPRINT_KEY = 'pinposy_generation_fingerprint';
const LEGACY_IDEMPOTENCY_KEY = 'pinposy_generation_key';
let inMemoryRequest: PendingGenerationRequest | null = null;

/**
 * Store only a compact fingerprint, not the user's raw topic or generation
 * settings. The server still validates the full request against its own
 * idempotency fingerprint, so a local hash collision fails closed.
 */
export function createGenerationFingerprint(value: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 0x01000193) >>> 0;
    hashB = Math.imul(hashB ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `fp1:${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
}

function normalizeFingerprint(value: string): string {
  return value.startsWith('fp1:') ? value : createGenerationFingerprint(value);
}

function getDefaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function getLegacySessionStorage(): Pick<Storage, 'getItem' | 'removeItem'> | undefined {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Keep the active idempotency identity across tab/browser restarts. Only a
 * short fingerprint is persisted; the original topic remains in component
 * memory. If persistent storage is blocked, the in-memory copy still supports
 * retries during the current page lifetime.
 */
export function readPendingGenerationRequest(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = getDefaultStorage(),
): PendingGenerationRequest | null {
  if (inMemoryRequest) return { ...inMemoryRequest };

  if (storage) {
    try {
      const raw = storage.getItem(REQUEST_KEY);
      if (raw) {
        const value = JSON.parse(raw) as Partial<PendingGenerationRequest>;
        if (typeof value.fingerprint === 'string' && value.fingerprint &&
            typeof value.idempotencyKey === 'string' && value.idempotencyKey) {
          inMemoryRequest = {
            fingerprint: normalizeFingerprint(value.fingerprint),
            idempotencyKey: value.idempotencyKey,
          };
          // Upgrade records written by the earlier implementation without
          // leaving the raw topic/settings fingerprint in persistent storage.
          storage.setItem(REQUEST_KEY, JSON.stringify(inMemoryRequest));
          return { ...inMemoryRequest };
        }
      }
    } catch {
      // Try the previous tab-scoped store before falling back to memory.
    }
  }

  const legacyStorage = getLegacySessionStorage();
  if (legacyStorage) {
    try {
      const raw = legacyStorage.getItem(REQUEST_KEY);
      if (raw) {
        const value = JSON.parse(raw) as Partial<PendingGenerationRequest>;
        if (typeof value.fingerprint === 'string' && value.fingerprint &&
            typeof value.idempotencyKey === 'string' && value.idempotencyKey) {
          inMemoryRequest = {
            fingerprint: normalizeFingerprint(value.fingerprint),
            idempotencyKey: value.idempotencyKey,
          };
          try {
            if (storage) {
              storage.setItem(REQUEST_KEY, JSON.stringify(inMemoryRequest));
              legacyStorage.removeItem(REQUEST_KEY);
            }
          } catch {
            // The session copy remains usable for this page and future reloads.
          }
          return { ...inMemoryRequest };
        }
      }

      const fingerprint = legacyStorage.getItem(LEGACY_FINGERPRINT_KEY);
      const idempotencyKey = legacyStorage.getItem(LEGACY_IDEMPOTENCY_KEY);
      if (fingerprint && idempotencyKey) {
        inMemoryRequest = {
          fingerprint: normalizeFingerprint(fingerprint),
          idempotencyKey,
        };
        try {
          if (storage) {
            storage.setItem(REQUEST_KEY, JSON.stringify(inMemoryRequest));
            legacyStorage.removeItem(LEGACY_FINGERPRINT_KEY);
            legacyStorage.removeItem(LEGACY_IDEMPOTENCY_KEY);
          }
        } catch {
          // The session copy remains usable for this page and future reloads.
        }
        return { ...inMemoryRequest };
      }
    } catch {
      // Fall through to the page-lifetime copy.
    }
  }
  return null;
}

export function writePendingGenerationRequest(
  fingerprint: string,
  idempotencyKey: string,
  storage: Pick<Storage, 'setItem'> | undefined = getDefaultStorage(),
): boolean {
  if (!fingerprint || !idempotencyKey) return false;
  inMemoryRequest = { fingerprint: normalizeFingerprint(fingerprint), idempotencyKey };
  if (!storage) return false;
  try {
    storage.setItem(REQUEST_KEY, JSON.stringify(inMemoryRequest));
    return true;
  } catch {
    // If persistent storage is unavailable (for example, quota/security
    // restrictions), retain the old tab-scoped fallback where possible.
    const sessionStorage = getLegacySessionStorage();
    if (sessionStorage) {
      try {
        sessionStorage.setItem(REQUEST_KEY, JSON.stringify(inMemoryRequest));
      } catch {
        // In-memory retry remains available for this page lifetime.
      }
    }
    return false;
  }
}

export function clearPendingGenerationRequest(
  storage: Pick<Storage, 'removeItem'> | undefined = getDefaultStorage(),
): void {
  inMemoryRequest = null;
  const targets = [storage, getLegacySessionStorage()];
  for (const target of targets) {
    if (!target) continue;
    for (const key of [REQUEST_KEY, LEGACY_FINGERPRINT_KEY, LEGACY_IDEMPOTENCY_KEY]) {
      try {
        target.removeItem(key);
      } catch {
        // Continue clearing other keys; a stale key is harmless because each
        // new request compares its fingerprint before reusing an identity.
      }
    }
  }
}
