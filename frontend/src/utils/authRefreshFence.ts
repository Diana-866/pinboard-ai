export interface AuthRefreshSnapshot {
  requestId: number;
  token: string;
}

/** A /me response may update auth state only while both request and token still match. */
export function isCurrentAuthRefresh(
  snapshot: AuthRefreshSnapshot,
  currentRequestId: number,
  currentToken: string | null
): boolean {
  return Boolean(snapshot.token) &&
    snapshot.requestId === currentRequestId &&
    snapshot.token === currentToken;
}
