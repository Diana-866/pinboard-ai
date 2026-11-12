/** True only when the API explicitly confirms that a generation replay window expired. */
export function isExpiredGenerationRecoveryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; data?: { code?: unknown } | null };
  return candidate.status === 410 && candidate.data?.code === 'idempotency_result_expired';
}
