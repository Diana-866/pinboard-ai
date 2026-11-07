/**
 * A failed generation request is safe to retry with a fresh idempotency key
 * only when the backend explicitly confirms a definitive failure. In-progress
 * and unknown provider outcomes must retain their original key for recovery.
 */
export function isDefinitiveGenerationFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return false;
  return (data as { code?: unknown }).code === 'generation_request_failed';
}
