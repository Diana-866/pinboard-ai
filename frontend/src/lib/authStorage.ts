/**
 * Access the browser's auth token defensively. Privacy modes, sandboxed
 * contexts and browser policy can make even reading localStorage throw.
 * Authentication must fail closed, but storage exceptions must not escape
 * before the API client's normal error handling.
 */
function getAuthStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readAuthToken(): string | null {
  try {
    const token = getAuthStorage()?.getItem("token");
    return typeof token === "string" && token.trim() ? token : null;
  } catch {
    return null;
  }
}

export function writeAuthToken(token: unknown): boolean {
  if (typeof token !== "string" || !token.trim()) return false;
  try {
    const storage = getAuthStorage();
    if (!storage) return false;
    storage.setItem("token", token);
    return true;
  } catch {
    return false;
  }
}

export function clearAuthToken(): void {
  try {
    getAuthStorage()?.removeItem("token");
  } catch {
    // Clearing a token is best-effort when browser storage is unavailable.
  }
}
