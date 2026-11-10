"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const correlationStorage = new AsyncLocalStorage();
const SAFE_ERROR_CODES = new Set([
  "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EPIPE",
  "ABORT_ERR", "ERR_NETWORK", "ERR_CANCELED", "ERR_BAD_REQUEST", "ERR_BAD_RESPONSE",
  "ERR_INVALID_URL", "23505", "23503", "23514", "22P02", "PGRST116",
]);

function runWithCorrelationId(id, callback) {
  const safeId = typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)
    ? id.toLowerCase()
    : undefined;
  return correlationStorage.run(safeId, callback);
}

function currentCorrelationId() {
  return correlationStorage.getStore();
}

// Production-safe logger: deliberately serializes only fixed, low-risk fields.
// Never pass request objects, provider payloads, headers, tokens, or raw errors through.
function safeEventName(value) {
  if (typeof value !== "string") return "unclassified_error";
  const normalized = value.toLowerCase();
  // Require a static, namespaced event key. Do not sanitize arbitrary text into
  // a plausible event name: that can preserve fragments of emails or other PII.
  return normalized.length <= 80 && /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/.test(normalized)
    ? normalized
    : "unclassified_error";
}

function safeErrorCode(error) {
  try {
    const code = error && typeof error === "object" ? error.code : null;
    return typeof code === "string" && SAFE_ERROR_CODES.has(code) ? code : undefined;
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
  const correlationId = currentCorrelationId();
  if (correlationId) record.correlation_id = correlationId;
  const code = safeErrorCode(error);
  if (code) record.error_code = code;
  // Intentionally omit message, stack, cause, request, response, and arbitrary metadata.
  const serialized = JSON.stringify(record);
  if (record.level === "warn") console.warn(serialized);
  else console.error(serialized);
}

function logError(event, error, status) {
  return logEvent("error", event, error, status);
}

function logWarning(event, error, status) {
  return logEvent("warn", event, error, status);
}

function logInfo(event) {
  const record = { level: "info", event: safeEventName(event) };
  const correlationId = currentCorrelationId();
  if (correlationId) record.correlation_id = correlationId;
  console.info(JSON.stringify(record));
}

module.exports = { logError, logWarning, logInfo, runWithCorrelationId };
