"use strict";

const SENSITIVE_VALUE_PATTERN = /((?:authorization\s*:\s*bearer\s+)|(?:\bbearer\s+)|(?:\b(?:access_token|refresh_token|client_secret|client_id|token)\s*[=:]\s*["']?))[^ \t\r\n"'&,}]+/gi;

function sanitizePinterestProviderMessage(data, fallback = "unknown error") {
  try {
    if (!data) return String(fallback).slice(0, 300);
    let message;
    if (typeof data === "string") {
      message = data;
    } else if (typeof data === "object") {
      message = data.message || data.error_description || data.error || fallback;
    } else {
      message = fallback;
    }
    return String(message)
      .replace(SENSITIVE_VALUE_PATTERN, "$1[redacted]")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 300);
  } catch {
    // Provider payloads are untrusted. A malformed getter must not turn an
    // ordinary provider rejection into an unhandled server error.
    return String(fallback).slice(0, 300);
  }
}

module.exports = { sanitizePinterestProviderMessage };
