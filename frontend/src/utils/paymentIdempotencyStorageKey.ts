/**
 * Keep browser checkout keys isolated by authenticated owner. Billing history
 * for one account must never release another account's pending checkout key.
 */
export function buildPaymentIdempotencyStorageKey(ownerId: string, scope: string): string {
  if (typeof ownerId !== 'string' || !ownerId.trim() || typeof scope !== 'string' || !scope.trim()) {
    throw new Error('Payment idempotency storage requires an owner and scope');
  }
  return `pinposy:payment-idempotency:${encodeURIComponent(ownerId)}:${scope}`;
}
