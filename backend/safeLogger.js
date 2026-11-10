"use strict";

// Production-safe logger: deliberately serializes only fixed, low-risk fields.
// Never pass request objects, provider payloads, headers, tokens, or raw errors through.
function safeEventName(value) {
  if (typeof value !== "string") return "unclassified_error";
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.-]/g, "_").slice(0, 80);
  return normalized || "unclassified_error";
}

function safeErrorCode(error) {
  try {
    const code = error && typeof error === "object" ? error.code : null;
    return typeof code === "string" && /^[A-Z0-9_-]{1,40}$/.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function logEvent(level, event, error, status) {
  const record = {
    level: level === "warn" ? "warn" : "error",
    event: safeEventName(event),
  };
  if (Number.isInteger(status) && status >= 400 && status <= 599) record.status = status;
  const code = safeErrorCode(error);
  if (code) record.error_code = code;
  // Intentionally omit message, stack, cause, request, response, and arbitrary metadata.
  console.error(JSON.stringify(record));
}

function logError(event, error, status) {
  return logEvent("error", event, error, status);
}

function logWarning(event, error, status) {
  return logEvent("warn", event, error, status);
}

module.exports = { logError, logWarning };
