"use strict";

const fs = require("node:fs");
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
    if (typeof code !== "string") return undefined;
    // Коды отказа конфигурации статичны: они называют, ЧЕГО не хватает, и не содержат значений.
    if (/^config_[a-z0-9_]{1,48}$/.test(code)) return code;
    return SAFE_ERROR_CODES.has(code) ? code : undefined;
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
  // Статус ответа внешнего провайдера: целое число, не содержит данных и PII.
  const providerStatus = error && error.providerStatus;
  if (Number.isInteger(providerStatus) && providerStatus >= 100 && providerStatus <= 599) {
    record.provider_status = providerStatus;
  }
  const correlationId = currentCorrelationId();
  if (correlationId) record.correlation_id = correlationId;
  const errorName = error && typeof error.name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(error.name)
    ? error.name
    : undefined;
  if (errorName) record.error_name = errorName;
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


/**
 * Pinterest HTTP rejection diagnostics.
 * Log only the provider's HTTP status, machine code and bounded message. Never serialize
 * response objects, headers, request bodies or credentials. Provider messages are redacted
 * for common bearer/API-token formats before they reach the production log.
 */
function logPinterestHttpFailure(status, data) {
  if (!Number.isInteger(status) || status < 400 || status > 599) return;

  let providerCode;
  let rawMessage;
  try {
    if (data && typeof data === "object") {
      const nested = data.error && typeof data.error === "object" ? data.error : null;
      const code = data.code !== undefined ? data.code : nested && nested.code;
      if (Number.isSafeInteger(code) && code >= 0 && code <= 999999) providerCode = code;
      else if (typeof code === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(code)) providerCode = code;
      rawMessage = typeof data.message === "string" ? data.message
        : typeof data.error_description === "string" ? data.error_description
          : nested && typeof nested.message === "string" ? nested.message
            : typeof data.error === "string" ? data.error : undefined;
    } else if (typeof data === "string") {
      rawMessage = data;
    }
  } catch {
    // Malformed/hostile provider envelopes are not a reason to serialize the object.
  }

  const record = {
    level: "error",
    event: "pinterest.api_response_failed",
    provider_status: status,
  };
  if (providerCode !== undefined) record.provider_code = providerCode;
  if (typeof rawMessage === "string" && rawMessage.trim()) {
    const message = rawMessage
      .replace(/[\\r\\n\\t]+/g, " ")
      .replace(/\\bBearer\\s+[^\\s,;]+/gi, "Bearer [redacted]")
      .replace(/\\b(access_token|refresh_token|client_secret|token|authorization)\\s*[:=]\\s*("[^"]*"|'[^']*'|[^\\s,;]+)/gi, "$1=[redacted]")
      .replace(/\\beyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\b/g, "[redacted]")
      .replace(/\\bpina_[A-Za-z0-9_-]{8,}\\b/gi, "[redacted]")
      .slice(0, 240);
    record.provider_message = message;
  }
  const correlationId = currentCorrelationId();
  if (correlationId) record.correlation_id = correlationId;
  console.error(JSON.stringify(record));
}

function logFatalSync(event, error) {
  const record = { level: "fatal", event: safeEventName(event) };
  // Section 151: без этого падение при старте было безымянным. Пишем только белый список:
  // имя класса и статический код. Текст ошибки, стек и причина rejection не попадают никогда.
  const errorName = error && typeof error.name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(error.name)
    ? error.name
    : undefined;
  if (errorName) record.error_name = errorName;
  const code = safeErrorCode(error);
  if (code) record.error_code = code;
  const correlationId = currentCorrelationId();
  if (correlationId) record.correlation_id = correlationId;
  // Fatal diagnostics must be synchronously written before fail-fast process exit.
  // Never inspect or serialize the exception/rejection reason.
  fs.writeSync(2, `${JSON.stringify(record)}\n`);
}

function logInfo(event) {
  const record = { level: "info", event: safeEventName(event) };
  const correlationId = currentCorrelationId();
  if (correlationId) record.correlation_id = correlationId;
  console.info(JSON.stringify(record));
}

module.exports = { logError, logWarning, logInfo, logPinterestHttpFailure, logFatalSync, runWithCorrelationId };
