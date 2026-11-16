export interface PendingGenerationRequest {
  fingerprint: string;
  idempotencyKey: string;
}

const REQUEST_KEY = 'pinposy_generation_request_v1';
const LEGACY_FINGERPRINT_KEY = 'pinposy_generation_fingerprint';
const LEGACY_IDEMPOTENCY_KEY = 'pinposy_generation_key';
const REQUEST_KEY_PREFIX = 'pinposy_generation_request_v2:';
const FINGERPRINT_PATTERN = /^fp1:[a-f0-9]{16}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
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

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>;

function getDefaultStorage(): StorageLike | undefined {
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
        typeof value.idempotencyKey !== 'string') return null;
    const fingerprint = normalizeFingerprint(value.fingerprint);
    if (!FINGERPRINT_PATTERN.test(fingerprint) || !IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey)) return null;
    return { fingerprint, idempotencyKey: value.idempotencyKey };
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
  if (!fingerprint || typeof idempotencyKey !== 'string') return false;
  const normalized = normalizeFingerprint(fingerprint);
  if (!FINGERPRINT_PATTERN.test(normalized) || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) return false;
  const request = { fingerprint: normalized, idempotencyKey };
  inMemoryRequests.set(normalized, request);
  if (storage) {
    try {
      storage.setItem(storageKey(normalized), JSON.stringify(request));
      return true;
    } catch {
      // Try tab-scoped storage below.
    }
  }
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

/** Enumerate saved request identities without exposing request content or mutating storage. */
export function listPendingGenerationRequests(
  storage: StorageLike | undefined = getDefaultStorage(),
): PendingGenerationRequest[] {
  const found = new Map<string, PendingGenerationRequest>();
  const add = (request: PendingGenerationRequest | null) => {
    if (!request || !FINGERPRINT_PATTERN.test(request.fingerprint) ||
        !IDEMPOTENCY_KEY_PATTERN.test(request.idempotencyKey)) return;
    if (!found.has(request.fingerprint)) found.set(request.fingerprint, request);
  };

  for (const request of inMemoryRequests.values()) add(request);

  for (const target of [storage, getLegacySessionStorage()]) {
    if (!target || typeof (target as StorageLike).length !== 'number' ||
        typeof (target as StorageLike).key !== 'function') continue;
    try {
      const entries = target as StorageLike;
      for (let index = 0; index < (entries.length || 0); index += 1) {
        const key = entries.key?.(index);
        if (!key?.startsWith(REQUEST_KEY_PREFIX)) continue;
        const request = parseRequest(entries.getItem(key));
        if (request?.fingerprint === key.slice(REQUEST_KEY_PREFIX.length)) add(request);
      }
    } catch {
      // Storage may be disabled or revoked; keep identities found elsewhere.
    }
  }

  return Array.from(found.values(), (request) => ({ ...request }));
}

/** Clear one completed/abandoned request without erasing other pending generations. */
export function clearPendingGenerationRequest(
  fingerprint?: string,
  storage: Pick<Storage, 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>> | undefined = getDefaultStorage(),
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
  const targets: Array<
    Pick<Storage, 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>> | undefined
  > = [storage, getLegacySessionStorage()];
  for (const target of targets) {
    for (const key of [REQUEST_KEY, LEGACY_FINGERPRINT_KEY, LEGACY_IDEMPOTENCY_KEY]) {
      try { target?.removeItem(key); } catch { /* Best-effort legacy cleanup. */ }
    }
    if (target && typeof target.length === 'number' && typeof target.key === 'function') {
      const scopedKeys: string[] = [];
      try {
        for (let index = 0; index < target.length; index += 1) {
          const key = target.key(index);
          if (key?.startsWith(REQUEST_KEY_PREFIX)) scopedKeys.push(key);
        }
      } catch {
        // Still attempt legacy cleanup when storage enumeration is blocked.
      }
      for (const key of scopedKeys) {
        try { target.removeItem(key); } catch { /* Best-effort scoped cleanup. */ }
      }
    }
  }
}


/*
 * Account-scoped v3 records. v2 records were not tied to an authenticated
 * owner, so they are deliberately not imported into an account: doing so
 * after an account switch could expose another user's idempotency key.
 */
const OWNER_REQUEST_KEY_PREFIX = 'pinposy_generation_request_v3:';

function ownerStoragePrefix(ownerId: string): string {
  return OWNER_REQUEST_KEY_PREFIX + createGenerationFingerprint(ownerId).slice(4) + ':';
}

function ownerMemoryKey(ownerId: string, fingerprint: string): string {
  return ownerStoragePrefix(ownerId) + fingerprint;
}

function ownerStorageKey(ownerId: string, fingerprint: string): string {
  return ownerMemoryKey(ownerId, fingerprint);
}

export function readPendingGenerationRequestForOwner(
  ownerId: string,
  fingerprint: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = getDefaultStorage(),
): PendingGenerationRequest | null {
  if (!ownerId) return null;
  const normalized = normalizeFingerprint(fingerprint);
  if (!FINGERPRINT_PATTERN.test(normalized)) return null;
  const memoryKey = ownerMemoryKey(ownerId, normalized);
  const cached = inMemoryRequests.get(memoryKey);
  if (cached) return { ...cached };
  const key = ownerStorageKey(ownerId, normalized);
  try {
    const saved = parseRequest(storage?.getItem(key) || null);
    if (saved?.fingerprint !== normalized) return null;
    inMemoryRequests.set(memoryKey, saved);
    return { ...saved };
  } catch {
    return null;
  }
}

export function writePendingGenerationRequestForOwner(
  ownerId: string,
  fingerprint: string,
  idempotencyKey: string,
  storage: Pick<Storage, 'setItem'> | undefined = getDefaultStorage(),
): boolean {
  if (!ownerId) return false;
  const normalized = normalizeFingerprint(fingerprint);
  if (!FINGERPRINT_PATTERN.test(normalized) || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) return false;
  const request = { fingerprint: normalized, idempotencyKey };
  inMemoryRequests.set(ownerMemoryKey(ownerId, normalized), request);
  try {
    if (!storage) return false;
    storage.setItem(ownerStorageKey(ownerId, normalized), JSON.stringify(request));
    return true;
  } catch {
    return false;
  }
}

export function listPendingGenerationRequestsForOwner(
  ownerId: string,
  storage: StorageLike | undefined = getDefaultStorage(),
): PendingGenerationRequest[] {
  if (!ownerId) return [];
  const prefix = ownerStoragePrefix(ownerId);
  const found = new Map<string, PendingGenerationRequest>();
  for (const [key, request] of inMemoryRequests.entries()) {
    if (key.startsWith(prefix)) found.set(request.fingerprint, { ...request });
  }
  if (storage && typeof storage.length === 'number' && typeof storage.key === 'function') {
    try {
      for (let index = 0; index < (storage.length || 0); index += 1) {
        const key = storage.key?.(index);
        if (!key?.startsWith(prefix)) continue;
        const request = parseRequest(storage.getItem(key));
        if (request?.fingerprint === key.slice(prefix.length)) {
          found.set(request.fingerprint, request);
        }
      }
    } catch {
      // In-memory owner-scoped records remain available when storage is blocked.
    }
  }
  return Array.from(found.values(), (request) => ({ ...request }));
}

export function clearPendingGenerationRequestForOwner(
  ownerId: string,
  fingerprint: string,
  storage: Pick<Storage, 'removeItem'> | undefined = getDefaultStorage(),
): void {
  if (!ownerId) return;
  const normalized = normalizeFingerprint(fingerprint);
  inMemoryRequests.delete(ownerMemoryKey(ownerId, normalized));
  try { storage?.removeItem(ownerStorageKey(ownerId, normalized)); } catch { /* Best effort */ }
}
