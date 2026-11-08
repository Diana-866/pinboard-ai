const test = require("node:test");
const assert = require("node:assert/strict");
const { isCommittedTokenRefresh, hasActiveRefreshLease, isExplicitRefreshRateLimit } = require("../pinterestRefreshRecovery");

const before = {
  access_token: "access-old",
  refresh_token: "refresh-old",
  updated_at: "2026-11-07T10:00:00.000Z",
};

test("does not mistake the uncertainty-fence timestamp for a committed refresh", () => {
  const fenced = {
    ...before,
    refresh_state: "uncertain",
    updated_at: "2026-11-07T10:00:01.000Z",
  };
  assert.equal(isCommittedTokenRefresh(before, fenced), false);
});

test("accepts rotated credentials only after the row returns to ready", () => {
  const committed = {
    ...before,
    access_token: "access-new",
    refresh_token: "refresh-new",
    refresh_state: "ready",
    updated_at: "2026-11-07T10:00:02.000Z",
  };
  assert.equal(isCommittedTokenRefresh(before, committed), true);
});

test("does not mistake a reconnect with a preserved refresh token for a committed refresh", () => {
  const reconnected = {
    ...before,
    access_token: "access-from-reconnect",
    refresh_state: "ready",
    updated_at: "2026-11-07T10:00:02.000Z",
  };
  assert.equal(isCommittedTokenRefresh(before, reconnected), false);
});

test("does not accept a ready row with unchanged credentials", () => {
  const unchanged = {
    ...before,
    refresh_state: "ready",
    updated_at: "2026-11-07T10:00:02.000Z",
  };
  assert.equal(isCommittedTokenRefresh(before, unchanged), false);
});

test("does not accept changed credentials while refresh remains uncertain", () => {
  const ambiguous = {
    ...before,
    access_token: "access-new",
    refresh_token: "refresh-new",
    refresh_state: "uncertain",
  };
  assert.equal(isCommittedTokenRefresh(before, ambiguous), false);
});

test("treats a future lease as an in-flight refresh", () => {
  assert.equal(
    hasActiveRefreshLease({ lease_until: "2026-11-07T10:00:30.000Z" }, Date.parse("2026-11-07T10:00:00.000Z")),
    true
  );
});

test("does not treat an expired lease as an in-flight refresh", () => {
  assert.equal(
    hasActiveRefreshLease({ lease_until: "2026-11-07T10:00:00.000Z" }, Date.parse("2026-11-07T10:00:00.000Z")),
    false
  );
});

test("fails closed when the refresh lease is missing or malformed", () => {
  assert.equal(hasActiveRefreshLease(null), false);
  assert.equal(hasActiveRefreshLease({ lease_until: "not-a-date" }), false);
  assert.equal(hasActiveRefreshLease({}), false);
});

test("recognizes an explicit 429 as a safe rate-limit rejection", () => {
  assert.equal(isExplicitRefreshRateLimit(429), true);
  assert.equal(isExplicitRefreshRateLimit("429"), true);
});

test("does not classify ambiguous server or transport failures as safe retries", () => {
  for (const status of [400, 401, 403, 408, 500, 502, 503, 504, undefined, null]) {
    assert.equal(isExplicitRefreshRateLimit(status), false);
  }
});
