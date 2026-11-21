"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertJwtSecret, MIN_JWT_SECRET_BYTES } = require("../startupConfig");

test("accepts a JWT signing secret with at least 32 UTF-8 bytes", () => {
  assert.equal(MIN_JWT_SECRET_BYTES, 32);
  assert.equal(assertJwtSecret({ JWT_SECRET: "x".repeat(32) }), true);
});

test("rejects missing and weak JWT signing secrets", () => {
  for (const env of [{}, { JWT_SECRET: "" }, { JWT_SECRET: "short" }]) {
    assert.throws(
      () => assertJwtSecret(env),
      /JWT_SECRET must be configured with at least 32 bytes/
    );
  }
});

test("measures secret strength in bytes rather than JavaScript characters", () => {
  // 15 Cyrillic characters are 30 UTF-8 bytes: below the 32-byte minimum even
  // though the string length is comfortably longer than a byte count check.
  assert.throws(
    () => assertJwtSecret({ JWT_SECRET: "я".repeat(15) }),
    /JWT_SECRET must be configured with at least 32 bytes/
  );
  // 16 Cyrillic characters are exactly 32 UTF-8 bytes and are accepted.
  assert.equal(assertJwtSecret({ JWT_SECRET: "я".repeat(16) }), true);
  assert.equal(assertJwtSecret({ JWT_SECRET: "я".repeat(16) + "a".repeat(16) }), true);
});

test("a missing JWT secret carries a machine code that is safe to log", () => {
  // Section 151: код отказа - единственное, что попадает в журнал вместо текста ошибки.
  const { assertJwtSecret, JWT_SECRET_MISSING } = require("../startupConfig");
  assert.equal(JWT_SECRET_MISSING, "config_jwt_secret_missing");
  assert.throws(
    () => assertJwtSecret({ JWT_SECRET: "too-short" }),
    (error) => error.code === JWT_SECRET_MISSING
  );
  assert.equal(assertJwtSecret({ JWT_SECRET: "a".repeat(32) }), true);
});
