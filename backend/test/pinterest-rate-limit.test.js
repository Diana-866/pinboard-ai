const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { pinterestUserKey, limits } = require("../pinterestRateLimit");

test("Pinterest authenticated rate-limit keys are isolated by user, not shared client IP", () => {
  assert.equal(pinterestUserKey({ userId: "user-a", ip: "203.0.113.10" }), "user:user-a");
  assert.equal(pinterestUserKey({ userId: "user-a", ip: "198.51.100.20" }), "user:user-a");
  assert.notEqual(
    pinterestUserKey({ userId: "user-a", ip: "203.0.113.10" }),
    pinterestUserKey({ userId: "user-b", ip: "203.0.113.10" })
  );
});

test("Pinterest disconnect is throttled and account actions have a separate budget", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "pinterest.js"), "utf8");
  assert.ok(source.includes('app.post("/integrations/pinterest/disconnect", requireAuth, pinterestAccountLimiter,'));
  assert.deepEqual(limits.account, { windowMs: 60_000, limit: 5 });
});

test("Pinterest external API routes have bounded, separate request budgets", () => {
  assert.deepEqual(limits, {
    read: { windowMs: 60_000, limit: 10 },
    publish: { windowMs: 60_000, limit: 5 },
    schedule: { windowMs: 60_000, limit: 10 },
    account: { windowMs: 60_000, limit: 5 },
    oauthStart: { windowMs: 900_000, limit: 5 },
    oauthCallback: { windowMs: 900_000, limit: 10 },
    worker: { windowMs: 60_000, limit: 6 },
  });
});

/**
 * Section 128. The limits used to be written twice: once to build the limiters and once in the exported
 * table the tests assert. Changing one copy left the other silently disagreeing - the tests would pass
 * while production allowed twice the traffic. The table is now the only place a number may appear.
 */
test("every limiter is built from the table, so no second copy of a number can drift", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "pinterestRateLimit.js"), "utf8")
    .replace(/\r\n/g, "\n");
  const code = source.slice(source.indexOf("const LIMITS = Object.freeze({"));

  // A literal budget anywhere below the table is a second definition of a security limit.
  const literalCalls = [...code.matchAll(/userLimiter\(\s*\d/g)];
  assert.deepEqual(literalCalls, [], "limiters must be built with fromTable(key), not with numbers");

  const builtFrom = [...code.matchAll(/fromTable\("([a-zA-Z]+)"\)/g)].map((match) => match[1]);
  const keys = Object.keys(limits);
  assert.ok(builtFrom.length >= 5, `expected the table to drive the limiters, found ${builtFrom.length} uses`);
  for (const key of builtFrom) {
    assert.ok(keys.includes(key), `fromTable("${key}") must name a real bucket`);
  }
  // The two IP-keyed limiters have no user, but their numbers still come from the table.
  for (const key of ["oauthCallback", "worker"]) {
    assert.match(
      code,
      new RegExp(`LIMITS\.${key}\.windowMs`),
      `${key} must read its window from the table`
    );
    assert.match(code, new RegExp(`LIMITS\.${key}\.limit`), `${key} must read its limit from the table`);
  }
  assert.match(code, /limits: LIMITS,/, "the exported table must be the same object the limiters use");
});
