/**
 * Network/server failures after a remote publish POST may hide a successful side effect.
 *
 * The status alone is no longer the whole rule. Sections 109 and 110 gave the backend machine codes
 * for "this pin may already exist, do not send it again", and a code can travel on a status this
 * list does not treat as ambiguous (a 409 already is, but nothing stops a future 4xx carrying the
 * same meaning). A code-blind check would offer the retry button that the message tells the customer
 * not to press, so the code wins over the status.
 */

/** Codes that mean "the remote outcome is unknown or already done": never offer a repeat. */
const NO_RETRY_CODES = [
  "publication_reconciliation_required",
  "pin_already_scheduled",
];

export function isAmbiguousPinterestPublishStatus(status: unknown, code?: unknown): boolean {
  if (typeof code === "string" && NO_RETRY_CODES.includes(code)) return true;
  const value = Number(status);
  return value === 0 || value === 409 || value >= 500;
}
