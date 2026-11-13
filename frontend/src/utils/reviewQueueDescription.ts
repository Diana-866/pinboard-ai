/**
 * Prefer the exact description flushed to the server before adding a pin to review.
 * React state may still hold the pre-flush render value until the next render.
 */
export function resolveReviewQueueDescription(
  currentDescription: string,
  flushedDescription: string | null | undefined,
): string {
  return flushedDescription ?? currentDescription;
}
