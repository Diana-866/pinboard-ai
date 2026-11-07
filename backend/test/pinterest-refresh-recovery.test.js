const test = require("node:test");
const assert = require("node:assert/strict");
const { isCommittedTokenRefresh, hasActiveRefreshLease } = require("../pinterestRefreshRecovery");

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
