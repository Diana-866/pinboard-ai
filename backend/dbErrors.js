/**
 * Supabase returns plain `{ message, code, details, hint }` objects instead of
 * Error instances. Throwing them raw loses the message in every `String(err)`
 * path ("[object Object]") and makes retry/assert logic depend on object shape.
 *
 * `asError` normalizes any thrown value into an Error while preserving the
 * provider fields callers rely on (`code`, `details`, `hint`, `status`).
 */
function asError(error, fallbackMessage = "database error") {
  if (error instanceof Error) return error;

  const message =
    error && typeof error === "object" && typeof error.message === "string" && error.message
      ? error.message
      : fallbackMessage;
  const wrapped = new Error(message);

  if (error && typeof error === "object") {
    for (const key of ["code", "details", "hint", "status", "statusCode", "name"]) {
      if (error[key] !== undefined) {
        try {
          wrapped[key] = error[key];
        } catch {
          // Ignore read-only provider fields; the message is what matters.
        }
      }
    }
    if (wrapped.code !== undefined && wrapped.code !== null) {
      wrapped.code = String(wrapped.code);
    }
  }

  return wrapped;
}

/**
 * True when the error means "the query ran and matched no row".
 *
 * `error || !row` reads a database outage as an absence, and the price is different per caller: a
 * customer is told their project was deleted, or an administrator is told they lack the right to
 * change a tariff. PostgREST answers zero rows for `.single()` with PGRST116, so that code alone is
 * a missing row; everything else is a failure to look.
 */
function isMissingRow(error) {
  if (!error) return false;
  const code = String((error && (error.code || error.status)) || "");
  return code === "PGRST116";
}

module.exports = { asError, isMissingRow };
