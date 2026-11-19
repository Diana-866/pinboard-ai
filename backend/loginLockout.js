"use strict";

const { logWarning, logError } = require("./safeLogger");
const supabase = require("./supabase");
const { httpError } = require("./validate");

/**
 * Durable per-account login lockout (migration 164).
 *
 * The in-memory limiters in index.js count per address and per account, but they live in the
 * process: several instances multiply the budget and every restart resets it, so a distributed
 * guess against one account had no durable ceiling. This module is the durable half - the count
 * and the lock live on the user row and are only touched by service-role RPCs.
 *
 * Failure policy, deliberately split:
 *   * The RPC does not exist (migration not applied yet): work continues with the in-memory
 *     limits only, and the gap is logged. This mirrors how the code already treats optional
 *     columns such as account_status from migration 127: a deploy must not take login down.
 *   * Any other database error: the login fails closed with 503. A lockout we cannot read is a
 *     lockout we cannot enforce, and quietly ignoring it would silently drop the protection.
 */

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_SECONDS = 900;

function maxAttempts() {
  const raw = Number(process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS);
  return Number.isSafeInteger(raw) && raw >= 1 ? Math.min(raw, 50) : DEFAULT_MAX_ATTEMPTS;
}

function lockSeconds() {
  const raw = Number(process.env.LOGIN_LOCKOUT_SECONDS);
  return Number.isSafeInteger(raw) && raw >= 1 ? Math.min(raw, 24 * 60 * 60) : DEFAULT_LOCK_SECONDS;
}

/** True when the failure means "this migration has not been applied in this environment". */
function isMissingFeature(error) {
  const code = String((error && (error.code || error.status)) || "");
  const message = String((error && error.message) || "");
  return (
    code === "PGRST202" || // PostgREST: function not found in the schema cache
    code === "42883" || // PostgreSQL: undefined_function
    /could not find the function|function .* does not exist/i.test(message)
  );
}

function handleDbFailure(operation, error) {
  if (isMissingFeature(error)) {
    logWarning(`login_lockout.${operation}_unavailable`, `[login-lockout] ${operation} unavailable, migration 164 is not applied`);
    return { skipped: true };
  }
  logError(`login_lockout.${operation}_failed`);
  throw httpError(503, "Сервис входа временно недоступен — попробуйте позже");
}

function normalizeState(data) {
  const locked = !!(data && data.locked === true);
  const attempts = Number(data && data.failed_attempts);
  const retryAfter = Number(data && data.retry_after_seconds);
  return {
    locked,
    failedAttempts: Number.isSafeInteger(attempts) && attempts >= 0 ? attempts : 0,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 0,
  };
}

/** Current lock state for an address. Unknown addresses are never locked. */
async function lockState(email, db = supabase) {
  const { data, error } = await db.rpc("login_lock_state", { p_email: String(email || "") });
  if (error) {
    const handled = handleDbFailure("state", error);
    if (handled.skipped) return { locked: false, failedAttempts: 0, retryAfterSeconds: 0, skipped: true };
  }
  return normalizeState(data);
}

/** Count one failed attempt and return the resulting state. */
async function recordFailure(email, db = supabase) {
  const { data, error } = await db.rpc("record_failed_login", {
    p_email: String(email || ""),
    p_max_attempts: maxAttempts(),
    p_lock_seconds: lockSeconds(),
  });
  if (error) {
    const handled = handleDbFailure("record", error);
    if (handled.skipped) return { locked: false, failedAttempts: 0, retryAfterSeconds: 0, skipped: true };
  }
  return normalizeState(data);
}

/** Forget the failures after a successful password check. */
async function clearFailures(userId, db = supabase) {
  const { error } = await db.rpc("clear_login_failures", { p_user_id: String(userId || "") });
  if (error) {
    // The password was already correct, so this must never block the login; a stale counter only
    // means the next failure starts from a higher number.
    handleDbFailure("clear", error);
  }
  return true;
}

/**
 * Operator view of one account's lockout state.
 *
 * Unlike the login path, an admin endpoint must not degrade silently when the migration is missing:
 * the operator is asking a direct question and a wrong "not locked" would hide a real lockout. A
 * missing function is therefore a 503 that says which migration to apply.
 */
async function adminState(email, db = supabase) {
  const { data, error } = await db.rpc("login_lock_state", { p_email: String(email || "") });
  if (error) {
    if (isMissingFeature(error)) {
      throw httpError(503, "Замок входа недоступен: примените миграцию 164");
    }
    logError("login_lockout.admin_state_failed");
    throw httpError(503, "Не удалось получить состояние замка — попробуйте позже");
  }
  return normalizeState(data);
}

/**
 * Operator recovery: clears the counter and the lock for one address. The owner needs this to get
 * back into an account that an attacker deliberately locked, and to unblock a customer who cannot
 * log in. Granted to service_role only and reachable through the admin-only route.
 */
async function adminReset(email, db = supabase) {
  const { data, error } = await db.rpc("clear_login_failures_by_email", { p_email: String(email || "") });
  if (error) {
    if (isMissingFeature(error)) {
      throw httpError(503, "Сброс замка недоступен: примените миграцию 164");
    }
    logError("login_lockout.admin_reset_failed");
    throw httpError(503, "Не удалось сбросить замок — попробуйте позже");
  }
  const cleared = !!(data && data.cleared === true);
  const affected = Number(data && data.rows);
  return {
    cleared,
    affectedRows: Number.isSafeInteger(affected) && affected >= 0 ? affected : 0,
    reason: data && typeof data.reason === "string" ? data.reason : null,
  };
}

/** The refusal a locked account receives, with the wait the client can show. */
function lockedError(retryAfterSeconds) {
  const wait = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? Math.ceil(retryAfterSeconds) : lockSeconds();
  const minutes = Math.max(1, Math.ceil(wait / 60));
  const error = httpError(429, `Слишком много неудачных попыток входа. Повторите через ${minutes} мин.`);
  error.details = { code: "login_locked", retryAfterSeconds: wait };
  return error;
}

module.exports = {
  maxAttempts,
  lockSeconds,
  isMissingFeature,
  lockState,
  recordFailure,
  clearFailures,
  lockedError,
  adminState,
  adminReset,
};
