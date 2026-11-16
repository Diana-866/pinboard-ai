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
  assert.throws(
    () => assertJwtSecret({ JWT_SECRET: "я".repeat(16) }),
    /JWT_SECRET must be configured with at least 32 bytes/
  );
  assert.equal(assertJwtSecret({ JWT_SECRET: "я".repeat(16) + "a".repeat(16) }), true);
});
