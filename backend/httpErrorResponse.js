"use strict";

/**
 * The single place where a thrown error becomes an HTTP response.
 *
 * It used to live inside index.js, which is why nobody could test it, and it had a defect that
 * quietly disabled a client feature: for any status >= 500 it dropped `details` entirely. Every
 * provider failure (Pinterest unavailable, rate limited) is thrown with `details.code`, the client
 * maps that code to a localized message, and the code never arrived — so those messages could
 * only ever appear on the routes that answered directly instead of throwing.
 *
 * A machine code is safe to expose on a server-side failure: it names a category, not a cause.
 * Everything else in `details` stays inside the server, because details can legitimately carry
 * an email address, a provider payload or an internal identifier.
 */
const { logError, logWarning } = require("./safeLogger");

function respondWithError(res, e, publicMessage, status) {
  const code = status || (e && e.httpStatus) || (publicMessage ? 400 : 500);
  if (code >= 500) logError("http.request_failed", e, code);
  else logWarning("http.request_rejected", e, code);

  // Additional fields (for example 403 email_not_verified: retryAfterSeconds/emailSent) travel
  // next to `error`, so the frontend can show the exact message without extra requests.
  const extra = e && e.details && typeof e.details === "object" ? e.details : null;

  if (code >= 500) {
    // Only the machine code crosses the boundary on a server-side failure.
    const codeField = extra && typeof extra.code === "string" && extra.code.trim() ? { code: extra.code } : {};
    return res.status(code).json({
      error: publicMessage || "Внутренняя ошибка сервера, попробуйте позже",
      ...codeField,
    });
  }
  return res.status(code).json({
    error: publicMessage || (e && e.message) || "Ошибка запроса",
    ...(extra || {}),
  });
}

module.exports = { respondWithError };
