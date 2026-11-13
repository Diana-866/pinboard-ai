"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizePinterestProviderMessage } = require("../pinterestProviderMessage");

test("provider messages redact bearer credentials and token-like fields", () => {
  const message = sanitizePinterestProviderMessage(
    'Authorization: Bearer private-token access_token=abc123 refresh_token="refresh-secret" client_secret=secret'
  );
  assert.equal(message.includes("private-token"), false);
  assert.equal(message.includes("abc123"), false);
  assert.equal(message.includes("refresh-secret"), false);
  assert.equal(message.includes("client_secret=secret"), false);
  assert.equal(message.includes("refresh-secret"), false);
  assert.match(message, /\[redacted\]/);
});

test("provider message extraction supports known Pinterest error fields", () => {
  assert.equal(sanitizePinterestProviderMessage({ message: "Board unavailable" }), "Board unavailable");
  assert.equal(sanitizePinterestProviderMessage({ error_description: "Invalid grant" }), "Invalid grant");
  assert.equal(sanitizePinterestProviderMessage({ error: "invalid_request" }), "invalid_request");
});

test("provider message extraction fails closed for hostile payload getters", () => {
  const payload = {};
  Object.defineProperty(payload, "message", { get() { throw new Error("secret"); } });
  assert.equal(sanitizePinterestProviderMessage(payload, "safe fallback"), "safe fallback");
});

test("provider messages are flattened and bounded", () => {
  assert.equal(sanitizePinterestProviderMessage("line 1\nline 2"), "line 1 line 2");
  assert.equal(sanitizePinterestProviderMessage("x".repeat(400)).length, 300);
});
