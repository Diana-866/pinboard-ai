const test = require("node:test");
const assert = require("node:assert/strict");

const { pinterestUserKey, limits } = require("../pinterestRateLimit");

test("Pinterest authenticated rate-limit keys are isolated by user, not shared client IP", () => {
  assert.equal(pinterestUserKey({ userId: "user-a", ip: "203.0.113.10" }), "user:user-a");
  assert.equal(pinterestUserKey({ userId: "user-a", ip: "198.51.100.20" }), "user:user-a");
  assert.notEqual(
    pinterestUserKey({ userId: "user-a", ip: "203.0.113.10" }),
    pinterestUserKey({ userId: "user-b", ip: "203.0.113.10" })
  );
});

test("Pinterest external API routes have bounded, separate request budgets", () => {
  assert.deepEqual(limits, {
    read: { windowMs: 60_000, limit: 10 },
    publish: { windowMs: 60_000, limit: 5 },
    schedule: { windowMs: 60_000, limit: 10 },
    oauthStart: { windowMs: 900_000, limit: 5 },
    oauthCallback: { windowMs: 900_000, limit: 10 },
    worker: { windowMs: 60_000, limit: 6 },
  });
});
