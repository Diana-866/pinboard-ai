"use strict";

/**
 * A deadline for database calls.
 *
 * supabase-js issues plain `fetch` requests with no timeout, so a database connection that
 * stops answering holds the HTTP request open until the platform's TCP timeout — minutes,
 * while the caller's own deadline was 45 seconds and the user gave up long before. Every
 * query is now bounded.
 *
 * Aborting a request does not roll anything back, so a timed-out write is simply an
 * ambiguous outcome — the same situation the code already handles for a network partition:
 * idempotency keys, uncertainty fences and reconciliation exist for exactly that case. The
 * budget is therefore generous (20 s by default) and configurable.
 */

const DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Wrap a fetch implementation so that every call aborts after `timeoutMs`.
 *
 * Returns undefined when there is no usable fetch, so supabase-js keeps its own default
 * instead of receiving a broken function.
 */
function buildTimedFetch(baseFetch, timeoutMs, timeoutFlag = { current: false }) {
  if (typeof baseFetch !== "function") return undefined;
  const budget = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS;

  return (input, init = {}) => {
    // A caller that already supplies a signal keeps control of the outcome.
    if (init && init.signal) return baseFetch(input, init);

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeoutFlag.current = true;
      controller.abort();
    }, budget);
    // Deliberately not unref()'d: while a request is pending, this timer is the only thing
    // that can settle it.

    // The deadline is enforced here as well as through the signal, because the underlying
    // implementation is not obliged to reject when a signal fires (a polyfill or a proxy may
    // ignore it). Racing guarantees the caller is released either way.
    const deadline = new Promise((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => {
          const error = new Error("supabase_request_timeout");
          error.name = "AbortError";
          error.code = "supabase_request_timeout";
          reject(error);
        },
        { once: true }
      );
    });

    let request;
    try {
      request = Promise.resolve(baseFetch(input, { ...init, signal: controller.signal })).finally(() =>
        clearTimeout(timer)
      );
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }

    return Promise.race([request, deadline]).finally(() => {
      clearTimeout(timer);
      // If the deadline won, the request may still settle later; swallow that outcome so it
      // does not surface as an unhandled rejection.
      if (timedOut) request.catch(() => {});
    });
  };
}

function readSupabaseTimeoutMs(env = process.env) {
  const configured = Number(env.SUPABASE_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS;
  // A quarter of a second is pointless and an hour defeats the purpose.
  return Math.min(120_000, Math.max(1_000, Math.round(configured)));
}

module.exports = {
  DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS,
  buildTimedFetch,
  readSupabaseTimeoutMs,
};
