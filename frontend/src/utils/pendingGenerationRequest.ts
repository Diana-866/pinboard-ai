export interface PendingGenerationRequest {
  fingerprint: string;
  idempotencyKey: string;
}

const REQUEST_KEY = 'pinposy_generation_request_v1';
const LEGACY_FINGERPRINT_KEY = 'pinposy_generation_fingerprint';
const LEGACY_IDEMPOTENCY_KEY = 'pinposy_generation_key';
const REQUEST_KEY_PREFIX = 'pinposy_generation_request_v2:';
let inMemoryRequests = new Map<string, PendingGenerationRequest>();

/** Store a compact fingerprint, never the user's raw topic or generation settings. */
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

function getDefaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'> | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function getLegacySessionStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

function storageKey(fingerprint: string): string {
  return `${REQUEST_KEY_PREFIX}${fingerprint}`;
}

function parseRequest(raw: string | null): PendingGenerationRequest | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingGenerationRequest>;
    if (typeof value.fingerprint !== 'string' || !value.fingerprint ||
        typeof value.idempotencyKey !== 'string' || !value.idempotencyKey) return null;
    return { fingerprint: normalizeFingerprint(value.fingerprint), idempotencyKey: value.idempotencyKey };
  } catch {
    return null;
  }
}

/** Restore only the identity for this exact request; other pending requests remain untouched. */
export function readPendingGenerationRequest(
  fingerprint: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = getDefaultStorage(),
): PendingGenerationRequest | null {
  const normalized = normalizeFingerprint(fingerprint);
  const inMemory = inMemoryRequests.get(normalized);
  if (inMemory) return { ...inMemory };

  if (storage) {
    try {
      const scoped = parseRequest(storage.getItem(storageKey(normalized)));
      if (scoped?.fingerprint === normalized) {
        inMemoryRequests.set(normalized, scoped);
        return { ...scoped };
      }
    } catch {
      // Continue with legacy migration and the tab-scoped fallback.
    }
  }

  const legacyStorage = getLegacySessionStorage();
  if (legacyStorage) {
    try {
      const scopedSession = parseRequest(legacyStorage.getItem(storageKey(normalized)));
      if (scopedSession?.fingerprint === normalized) {
        inMemoryRequests.set(normalized, scopedSession);
        return { ...scopedSession };
      }
      const legacy = parseRequest(legacyStorage.getItem(REQUEST_KEY));
      if (legacy?.fingerprint === normalized) {
        inMemoryRequests.set(normalized, legacy);
        try {
          if (storage) {
            storage.setItem(storageKey(normalized), JSON.stringify(legacy));
            legacyStorage.removeItem(REQUEST_KEY);
          }
        } catch {
          // Keep the legacy session record if persistent migration is blocked.
        }
        return { ...legacy };
      }
      const oldFingerprint = legacyStorage.getItem(LEGACY_FINGERPRINT_KEY);
      const oldKey = legacyStorage.getItem(LEGACY_IDEMPOTENCY_KEY);
      if (oldFingerprint && oldKey && normalizeFingerprint(oldFingerprint) === normalized) {
        const migrated = { fingerprint: normalized, idempotencyKey: oldKey };
        inMemoryRequests.set(normalized, migrated);
        try {
          if (storage) {
            storage.setItem(storageKey(normalized), JSON.stringify(migrated));
            legacyStorage.removeItem(LEGACY_FINGERPRINT_KEY);
            legacyStorage.removeItem(LEGACY_IDEMPOTENCY_KEY);
          }
        } catch {
          // Keep the tab-scoped values available for the next attempt.
        }
        return { ...migrated };
      }
    } catch {
      // Fall through to no saved identity.
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
  const normalized = normalizeFingerprint(fingerprint);
  const request = { fingerprint: normalized, idempotencyKey };
  inMemoryRequests.set(normalized, request);
  if (!storage) return false;
  try {
    storage.setItem(storageKey(normalized), JSON.stringify(request));
    return true;
  } catch {
    const sessionStorage = getLegacySessionStorage();
    if (sessionStorage) {
      try {
        sessionStorage.setItem(storageKey(normalized), JSON.stringify(request));
      } catch {
        // In-memory retry remains available for this page lifetime.
      }
    }
    return false;
  }
}

/** Clear one completed/abandoned request without erasing other pending generations. */
export function clearPendingGenerationRequest(
  fingerprint?: string,
  storage: Pick<Storage, 'removeItem'> | undefined = getDefaultStorage(),
): void {
  if (fingerprint) {
    const normalized = normalizeFingerprint(fingerprint);
    inMemoryRequests.delete(normalized);
    const key = storageKey(normalized);
    for (const target of [storage, getLegacySessionStorage()]) {
      try { target?.removeItem(key); } catch { /* Continue clearing other stores. */ }
    }
    return;
  }
  inMemoryRequests.clear();
  for (const target of [storage, getLegacySessionStorage()]) {
    for (const key of [REQUEST_KEY, LEGACY_FINGERPRINT_KEY, LEGACY_IDEMPOTENCY_KEY]) {
      try { target?.removeItem(key); } catch { /* Best-effort legacy cleanup. */ }
    }
  }
}
