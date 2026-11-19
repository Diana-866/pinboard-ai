import { getAppErrorMessage } from '../i18n/appErrorCopy';
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
  throw new Error(getAppErrorMessage('secureKeyUnavailable'));
}

export function isDefinitiveGenerationFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return false;
  const code = (data as { code?: unknown }).code;
  const status = (error as { status?: unknown }).status;
  return code === 'generation_request_failed' || code === 'generation_insufficient_credits' ||
    (code === 'idempotency_result_expired' && status === 410);
}
