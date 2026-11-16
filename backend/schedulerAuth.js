"use strict";

const crypto = require("node:crypto");

/**
 * Compare the configured scheduler secret without leaking length or content
 * through a timing-sensitive string comparison.
 */
function isValidSchedulerSecret(expectedValue, providedValue) {
  const expected = Buffer.from(String(expectedValue || ""));
  const provided = Buffer.from(String(providedValue || ""));
  return expected.length >= 32 &&
    provided.length === expected.length &&
    crypto.timingSafeEqual(expected, provided);
}

module.exports = { isValidSchedulerSecret };
