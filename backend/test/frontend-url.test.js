const test = require("node:test");
const assert = require("node:assert/strict");
const { frontendBaseUrl } = require("../frontend-url");

test("uses the configured frontend origin", () => {
  assert.equal(frontendBaseUrl("https://pinposy.com/app"), "https://pinposy.com");
});

test("uses only the first configured frontend origin", () => {
  assert.equal(frontendBaseUrl("https://pinposy.com,https://preview.example"), "https://pinposy.com");
});

test("falls back for malformed or unsafe frontend URLs", () => {
  assert.equal(frontendBaseUrl("javascript:alert(1)"), "https://pinposy.com");
  assert.equal(frontendBaseUrl("not a URL"), "https://pinposy.com");
  assert.equal(frontendBaseUrl("https://user:pass@evil.example"), "https://pinposy.com");
});
