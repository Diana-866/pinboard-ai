/**
 * A failed generation request is safe to retry with a fresh idempotency key
 * only when the backend explicitly confirms a definitive failure. In-progress
 * and unknown provider outcomes must retain their original key for recovery.
 */
type GenerationCrypto = Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>>;

/** Generate an opaque idempotency key using secure browser randomness. */
export function createGenerationIdempotencyKey(
  cryptoApi: GenerationCrypto | undefined = globalThis.crypto,
): string {
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID().replace(/-/g, '_');
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Безопасная генерация ключа недоступна. Откройте PinPosy через защищённое HTTPS-соединение и повторите попытку.');
}

export function isDefinitiveGenerationFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return false;
  const code = (data as { code?: unknown }).code;
  return code === 'generation_request_failed' || code === 'generation_insufficient_credits';
}
/** The generation endpoint uses HTTP 409 when the same durable request is still running. */
export function isGenerationInProgress(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return false;
  return (data as { code?: unknown }).code === 'generation_in_progress';
}

export type GenerationRecoveryStatus = 'processing' | 'completed' | 'failed' | 'unknown';

/** Never label an empty or malformed completion payload as a durable success. */
export function normalizeGenerationRecoveryStatus(
  status: unknown,
  pins: unknown,
): GenerationRecoveryStatus {
  if (status === 'completed') {
    return Array.isArray(pins) && pins.length > 0 ? 'completed' : 'unknown';
  }
  return status === 'processing' || status === 'failed' || status === 'unknown'
    ? status
    : 'unknown';
}
