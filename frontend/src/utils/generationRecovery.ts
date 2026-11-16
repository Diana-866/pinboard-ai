/** True only when the API explicitly confirms that a generation replay window expired. */
export function isExpiredGenerationRecoveryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; data?: { code?: unknown } | null };
  return candidate.status === 410 && candidate.data?.code === 'idempotency_result_expired';
}

/** Poll only while the server reports work that can still resolve. */
export function shouldPollGenerationRecovery(
  requests: ReadonlyArray<{ status: string }>,
  pausedForAuthentication = false,
): boolean {
  if (pausedForAuthentication) return false;
  return requests.some((request) => request.status === 'processing' || request.status === 'unknown');
}

/** Keep every locally stored request visible when a status lookup is blocked by an expired session. */
export function buildUnknownGenerationRecoveryEntries(
  identities: ReadonlyArray<{ fingerprint: string }>,
): Array<{ key: string; status: 'unknown'; boardId: string; pinCount: number }> {
  return identities.map((identity) => ({
    key: identity.fingerprint,
    status: 'unknown',
    boardId: '',
    pinCount: 0,
  }));
}
