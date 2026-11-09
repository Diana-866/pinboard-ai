const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPinImageRateLimitKey } = require("../pinImageRateLimitKey");

test("groups IPv6 addresses within the same /56 subnet", () => {
  const first = buildPinImageRateLimitKey({ ip: "2001:db8:abcd:1200::1" });
  const second = buildPinImageRateLimitKey({ ip: "2001:db8:abcd:12ff::99" });
  assert.equal(first, second);
});

test("keeps different IPv6 /56 subnets in separate buckets", () => {
  assert.notEqual(
    buildPinImageRateLimitKey({ ip: "2001:db8:abcd:1200::1" }),
    buildPinImageRateLimitKey({ ip: "2001:db8:abcd:1300::1" })
  );
});

test("uses the authenticated user identity instead of a rotating IP", () => {
  assert.equal(
    buildPinImageRateLimitKey({ userId: "user-123", ip: "2001:db8::1" }),
    buildPinImageRateLimitKey({ userId: "user-123", ip: "198.51.100.9" })
  );
  assert.notEqual(
    buildPinImageRateLimitKey({ userId: "user-123", ip: "198.51.100.9" }),
    buildPinImageRateLimitKey({ userId: "user-456", ip: "198.51.100.9" })
  );
});

test("keeps IPv4 clients keyed by their address", () => {
  assert.equal(
    buildPinImageRateLimitKey({ ip: "198.51.100.10" }),
    "ip:198.51.100.10"
  );
});

test("uses a conservative fallback when Express has no client IP", () => {
  assert.equal(buildPinImageRateLimitKey({}), "ip:unknown");
});
