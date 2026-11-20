/**
 * The wait after a login lockout.
 *
 * The backend already answered 429 login_locked with retryAfterSeconds, and the sign-in page said
 * the wait once - "try again in 15 minutes" - and never changed. A customer who waited the full
 * time still saw a message saying the account was locked, and nothing told them when it ended. The
 * arithmetic lives here so it can be tested without a DOM, which this project has no way to drive.
 *
 * Three decisions worth stating:
 * - the wait always comes from the server. A missing or nonsense value is not "no lock": the server
 *   said the account is locked, so the page waits a short, bounded default and asks again.
 * - the wait is clamped to a day. A wrong value must not make the page unusable until reload.
 * - remaining time counts whole seconds upward (ceil), so the page never disables the button for a
 *   fraction of a second after it has said "0".
 */

export const LOCKOUT_FALLBACK_SECONDS = 60;
export const LOCKOUT_MAX_SECONDS = 24 * 60 * 60;

export interface LockoutState {
  /** Wall-clock moment the wait ends; null when there is no active wait. */
  untilMs: number | null;
  /** Whole seconds left, never negative. */
  remainingSeconds: number;
}

/** Turn the server's retryAfterSeconds into the moment the page may submit again. */
export function lockoutDeadline(retryAfterSeconds: unknown, nowMs: number): number {
  const parsed = Number(retryAfterSeconds);
  const seconds = Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, LOCKOUT_MAX_SECONDS)
    : LOCKOUT_FALLBACK_SECONDS;
  return nowMs + Math.ceil(seconds) * 1000;
}

/** Whole seconds until the deadline; 0 once it has passed. */
export function lockoutSecondsRemaining(deadlineMs: number | null, nowMs: number): number {
  if (deadlineMs === null || !Number.isFinite(deadlineMs)) return 0;
  const left = deadlineMs - nowMs;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Recompute the state for the current moment. */
export function lockoutState(deadlineMs: number | null, nowMs: number): LockoutState {
  const remainingSeconds = lockoutSecondsRemaining(deadlineMs, nowMs);
  return {
    untilMs: remainingSeconds > 0 ? deadlineMs : null,
    remainingSeconds,
  };
}

/**
 * Fill a localized countdown. Both placeholders are supported because the older lockout copy uses
 * {minutes}; a template that carries neither is returned unchanged rather than silently losing its
 * only number.
 */
export function lockoutCountdownText(template: string, remainingSeconds: number): string {
  if (typeof template !== "string" || !template) return "";
  const seconds = Math.max(0, Math.ceil(Number(remainingSeconds) || 0));
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return template
    .replace(/\{seconds\}/g, String(seconds))
    .replace(/\{minutes\}/g, String(minutes));
}
