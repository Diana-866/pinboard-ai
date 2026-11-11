/**
 * Storage hygiene for shared browsers.
 *
 * Everything the app caches under a `pinposy_` / `pinposy.` key describes the
 * signed-in user: the review queue with pin texts and uploaded photos, drafted
 * pin descriptions, generation request identities, notifications, cadence and
 * avatar choices. Leaving those behind after a sign-out means the next person on
 * the same device sees the previous user's work.
 *
 * Device-level preferences (interface language, theme, timezone, AI content
 * language) are intentionally kept: they belong to the browser, not the account.
 */
const DEVICE_PREFERENCE_KEYS = new Set([
  "pinposy_lang",
  "pinposy_theme",
  "pinposy_ai_content_lang",
  "pinposy_user_timezone",
]);

const USER_SCOPED_PREFIXES = ["pinposy_", "pinposy."];

type StorageLike = Pick<Storage, "length" | "key" | "removeItem">;

export function isUserScopedStorageKey(key: unknown): boolean {
  if (typeof key !== "string" || !key) return false;
  if (DEVICE_PREFERENCE_KEYS.has(key)) return false;
  return USER_SCOPED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Remove every user-scoped entry from one storage object.
 * Returns the keys that were removed so callers (and tests) can verify the sweep.
 */
export function sweepUserScopedStorage(storage: StorageLike | null | undefined): string[] {
  const removed: string[] = [];
  if (!storage) return removed;

  try {
    const keys: string[] = [];
    const length = Number(storage.length) || 0;
    for (let index = 0; index < length; index += 1) {
      const key = storage.key(index);
      if (isUserScopedStorageKey(key)) keys.push(key as string);
    }
    // Collect first, then remove: removing inside the indexed loop shifts indices.
    for (const key of keys) {
      storage.removeItem(key);
      removed.push(key);
    }
  } catch {
    // Privacy modes can make storage throw; clearing is best-effort.
  }

  return removed;
}

function getStorage(kind: "local" | "session"): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Clear user-scoped data from localStorage and sessionStorage. */
export function clearUserScopedStorage(): void {
  sweepUserScopedStorage(getStorage("local"));
  sweepUserScopedStorage(getStorage("session"));
}

export const USER_SCOPED_STORAGE_DEVICE_PREFERENCES = DEVICE_PREFERENCE_KEYS;
