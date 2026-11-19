/**
 * Waiting out a generation that is already running.
 *
 * The backend answers 409 `{ code: "generation_in_progress", retryAfterSeconds }` when the
 * same idempotency key is already being processed — which happens on a reload during
 * generation, on a double submit, or when a second tab replays a stored request. The
 * server is designed for the client to wait and replay the *same* key: the finished result
 * is returned to the same key, and rotating it would start (and charge) a second
 * generation. The UI used to show this as an error, so a reload looked like a failure
 * while the images were still being produced.
 *
 * The loop is separated from the component so the interesting cases — giving up on time,
 * a server that answers "in progress" with no wait, a genuine failure — are testable
 * without a DOM and without timers.
 */

export interface GenerationRecoveryOptions {
  /** Injected so tests do not sleep for real. */
  sleep: (ms: number) => Promise<void>;
  /** Injected clock, in milliseconds. */
  now: () => number;
  /** Returns the wait in seconds when the error means "still running", else null. */
  getWaitSeconds: (error: unknown) => number | null;
  /** Total time to keep waiting. Defaults to 10 minutes. */
  maxWaitMs?: number;
  /** Hard cap on replays, so a zero-wait server cannot cause a hot loop. */
  maxAttempts?: number;
}

export const DEFAULT_GENERATION_MAX_WAIT_MS = 10 * 60_000;
export const DEFAULT_GENERATION_MAX_ATTEMPTS = 60;
/** Used when the server says "in progress" without saying for how long. */
export const DEFAULT_GENERATION_WAIT_SECONDS = 5;

/**
 * Replay `request` while it reports that the work is still running.
 *
 * A failure that is not "in progress" is rethrown at once: masking it as a slow generation
 * would hide a real error. When the budget runs out the last "in progress" error is thrown,
 * so the caller still shows something truthful.
 */
export async function runGenerationWithRecovery<T>(
  request: () => Promise<T>,
  options: GenerationRecoveryOptions
): Promise<T> {
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_GENERATION_MAX_WAIT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_GENERATION_MAX_ATTEMPTS;
  const startedAt = options.now();
  let attempts = 0;

  for (;;) {
    try {
      return await request();
    } catch (error) {
      const waitSeconds = options.getWaitSeconds(error);
      if (waitSeconds === null) throw error;

      attempts += 1;
      const waitMs = Math.max(0, waitSeconds) * 1000;
      const elapsed = options.now() - startedAt;
      const exhausted = attempts >= maxAttempts || elapsed + waitMs > maxWaitMs;
      if (exhausted) throw error;

      if (waitMs > 0) await options.sleep(waitMs);
      else await options.sleep(0);
    }
  }
}

/** Read the "still running" signal out of an ApiError-shaped object. */
export function getGenerationInProgressWait(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    status?: unknown;
    data?: { code?: unknown; retryAfterSeconds?: unknown } | null;
  };
  if (candidate.status !== 409) return null;
  if (candidate.data?.code !== "generation_in_progress") return null;
  const seconds = candidate.data?.retryAfterSeconds;
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(300, seconds);
  }
  // The server has always been designed to be polled every few seconds; a missing field
  // must not turn a recoverable state into an error.
  return DEFAULT_GENERATION_WAIT_SECONDS;
}
