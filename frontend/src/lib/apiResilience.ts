import { getApiFallbackMessage } from './apiErrorMessages';
import { readLocalStorageValue } from './authStorage';

/**
 * Two failure modes the request wrapper could not distinguish before:
 *
 *  - The backend enforces a global rate limit (429). The client showed the generic
 *    "something went wrong" and the user had no idea that waiting would fix it. A short
 *    wait is now retried once; a long one is reported with the real number of seconds.
 *  - A request that never settles left the UI spinning forever. There was no timeout at
 *    all, so a half-open connection meant a permanently disabled spinner.
 *
 * Everything here is pure so it can be tested without a DOM.
 */

/** Ceiling for a header value, so a hostile server cannot pin a request for an hour. */
export const MAX_RETRY_AFTER_SECONDS = 300;

/** Waits up to this long are retried transparently; longer ones are reported. */
export const MAX_TRANSPARENT_RETRY_SECONDS = 3;

/** Abort a request that produces no response at all. */
export const REQUEST_TIMEOUT_MS = 45_000;

/**
 * Read `Retry-After` in both forms the spec allows: delta-seconds and an HTTP date.
 * Returns whole seconds clamped to 0..MAX_RETRY_AFTER_SECONDS, or null when the header is
 * absent or unusable — the caller then falls back to a duration-free message.
 *
 * The date form is matched against the only shape RFC 7231 permits (IMF-fixdate) instead of
 * relying on `Date.parse`: V8 happily reads "1.5" and "-5" as dates far in the past, which
 * turned a malformed header into a bogus (and clamped) wait.
 */
export function getRetryAfterSeconds(
  headerValue: string | null | undefined,
  now: number = Date.now()
): number | null {
  if (headerValue === null || headerValue === undefined) return null;
  const raw = String(headerValue).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    return Math.min(MAX_RETRY_AFTER_SECONDS, Number(raw));
  }

  const IMF_FIXDATE = /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
  if (!IMF_FIXDATE.test(raw)) return null;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  const seconds = Math.ceil((parsed - now) / 1000);
  if (seconds <= 0) return 0;
  return Math.min(MAX_RETRY_AFTER_SECONDS, seconds);
}

/**
 * Wait for a 429, in the order of authority: the JSON body this backend sends
 * (`retryAfterSeconds`), then the standard `Retry-After` header, then the draft
 * `RateLimit-Reset` header. All three describe the same wait; reading them in order means
 * the client still works if a proxy strips headers or a future deployment stops sending the
 * body field.
 */
export function getRateLimitWait(
  headers: { get?: (name: string) => string | null } | null | undefined,
  body: unknown,
  now: number = Date.now()
): number | null {
  const fromBody = (body as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
  if (typeof fromBody === "number" && Number.isFinite(fromBody) && fromBody >= 0) {
    return Math.min(MAX_RETRY_AFTER_SECONDS, Math.round(fromBody));
  }
  const readHeader = (name: string): string | null => {
    try {
      return headers?.get?.(name) ?? null;
    } catch {
      return null;
    }
  };
  const fromRetryAfter = getRetryAfterSeconds(readHeader("Retry-After"), now);
  if (fromRetryAfter !== null) return fromRetryAfter;
  return getRetryAfterSeconds(readHeader("RateLimit-Reset"), now);
}

/** A wait this short is worth retrying once without telling the user anything. */
export function shouldRetryTransparently(seconds: number | null, attempt: number): boolean {
  if (attempt >= 1) return false; // exactly one retry
  if (seconds === null) return false; // unknown wait: do not guess
  return seconds > 0 && seconds <= MAX_TRANSPARENT_RETRY_SECONDS;
}

/**
 * Message for a 429. Without a usable wait the caller gets the generic fallback, because
 * "wait undefined seconds" would be worse than saying nothing specific.
 */
export function getRateLimitMessage(
  seconds: number | null,
  locale: string | null | undefined
): string {
  if (seconds === null || !Number.isFinite(seconds)) {
    return getApiFallbackMessage('generic', locale);
  }
  return getApiFallbackMessage('rateLimited', locale).replace('{seconds}', String(Math.max(1, Math.round(seconds))));
}

export function getTimeoutMessage(locale: string | null | undefined): string {
  return getApiFallbackMessage('timeout', locale);
}

/** The interface language is stored by the i18n context; failures happen before it loads. */
export function currentLocale(): string | null {
  return readLocalStorageValue('pinposy_lang');
}

/** True when a fetch rejection was our own timeout rather than a network error. */
export function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}
