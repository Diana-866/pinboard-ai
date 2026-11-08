const test = require("node:test");
const assert = require("node:assert/strict");
const { getPinterestTokenExpiresAt } = require("../pinterestOAuth");

test("missing optional Pinterest token expiry remains null", () => {
  assert.equal(getPinterestTokenExpiresAt(undefined, 1_800_000_000_000), null);
  assert.equal(getPinterestTokenExpiresAt(null, 1_800_000_000_000), null);
  assert.equal(getPinterestTokenExpiresAt("", 1_800_000_000_000), null);
  assert.equal(getPinterestTokenExpiresAt("   ", 1_800_000_000_000), null);
});

test("valid numeric and string expiry values are normalized to ISO timestamps", () => {
  const now = Date.parse("2026-11-09T12:00:00.000Z");
  assert.equal(getPinterestTokenExpiresAt(3600, now), "2026-11-09T13:00:00.000Z");
  assert.equal(getPinterestTokenExpiresAt("3600", now), "2026-11-09T13:00:00.000Z");
});

test("malformed, non-finite, zero and negative expiry values are rejected", () => {
  const now = Date.parse("2026-11-09T12:00:00.000Z");
  for (const value of ["abc", "Infinity", NaN, Infinity, 0, "0", -1, "-10"]) {
    assert.throws(() => getPinterestTokenExpiresAt(value, now), /invalid token expiry/);
  }
});

test("expiry values outside the JavaScript date range are rejected", () => {
  assert.throws(() => getPinterestTokenExpiresAt(Number.MAX_VALUE, 1), /invalid token expiry/);
});

test("invalid clock input is rejected instead of persisting a malformed date", () => {
  assert.throws(() => getPinterestTokenExpiresAt(3600, NaN), /invalid token expiry/);
});
