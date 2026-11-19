"use strict";

const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Operator recovery for the durable login lockout (migration 164).
 *
 * §60 added a durable per-account lockout, which also created an operational hole: an attacker who
 * knows the operator's address can lock that account, and a customer who mistyped a password five
 * times has to wait out the window. Neither could be resolved without touching the database by hand.
 *
 * These checks pin the two admin surfaces and their policy, which deliberately differs from the
 * login path: here a missing migration is a 503 that names it, because an operator asking a direct
 * question must not be told "not locked" by a degraded deployment.
 */

const SUPABASE = require.resolve("../supabase");
const LOCKOUT = require.resolve("../loginLockout");
const INDEX = path.join(__dirname, "..", "index.js");

function load(db) {
  require.cache[SUPABASE] = { id: SUPABASE, filename: SUPABASE, loaded: true, exports: db };
  delete require.cache[LOCKOUT];
  return require("../loginLockout");
}

test("the operator sees the real lockout state, including the remaining wait", async () => {
  const calls = [];
  const loginLockout = load({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { locked: true, failed_attempts: 5, retry_after_seconds: 420 }, error: null };
    },
  });

  const state = await loginLockout.adminState("victim@example.invalid");
  assert.deepEqual(state, { locked: true, failedAttempts: 5, retryAfterSeconds: 420 });
  assert.deepEqual(calls, [{ name: "login_lock_state", args: { p_email: "victim@example.invalid" } }]);
});

test("an operator asking about a missing migration is told so instead of being shown 'not locked'", async () => {
  // This is the deliberate difference from the login path: there, a missing migration must not take
  // login down; here, a wrong answer would hide a real lockout from the only person who can fix it.
  const loginLockout = load({
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }),
  });
  const stateError = await loginLockout.adminState("a@example.invalid").then(() => null, (error) => error);
  assert.equal(stateError.httpStatus, 503);
  assert.match(stateError.message, /миграцию 164/);

  const resetError = await loginLockout.adminReset("a@example.invalid").then(() => null, (error) => error);
  assert.equal(resetError.httpStatus, 503);
  assert.match(resetError.message, /миграцию 164/);
});

test("any other database failure is a generic 503 that does not leak the cause", async () => {
  const loginLockout = load({
    rpc: async () => ({ data: null, error: { code: "08006", message: "connection to server failed: password authentication" } }),
  });
  for (const call of [() => loginLockout.adminState("a@example.invalid"), () => loginLockout.adminReset("a@example.invalid")]) {
    const error = await call().then(() => null, (caught) => caught);
    assert.equal(error.httpStatus, 503);
    assert.doesNotMatch(error.message, /password authentication|08006/);
  }
});

test("clearing the lock. reports what it actually cleared", async () => {
  const calls = [];
  const loginLockout = load({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { cleared: true, rows: 1 }, error: null };
    },
  });

  const result = await loginLockout.adminReset("Victim@Example.INVALID");
  assert.deepEqual(result, { cleared: true, affectedRows: 1, reason: null });
  assert.deepEqual(calls, [{ name: "clear_login_failures_by_email", args: { p_email: "Victim@Example.INVALID" } }]);

  // A row that had nothing to clear reports zero, which is not an error.
  const nothing = load({ rpc: async () => ({ data: { cleared: true, rows: 0 }, error: null }) });
  assert.deepEqual(await nothing.adminReset("quiet@example.invalid"),
    { cleared: true, affectedRows: 0, reason: null });

  // A malformed answer must not be reported as a success.
  const malformed = load({ rpc: async () => ({ data: null, error: null }) });
  assert.deepEqual(await malformed.adminReset("a@example.invalid"),
    { cleared: false, affectedRows: 0, reason: null });
});

test("both admin routes are admin-only and the reset route is rate-limited before authentication", () => {
  const index = fs.readFileSync(INDEX, "utf8");

  const getRoute = /app\.get\("\/admin\/accounts\/login-lockout",([^)]*)\)/s.exec(index);
  assert.ok(getRoute, "the read route must exist");
  assert.match(getRoute[1], /requireAuth/, "the read route must authenticate");
  assert.match(getRoute[1], /requireAdmin/, "the read route must be admin-only");

  const resetRoute = /app\.post\("\/admin\/accounts\/login-lockout\/reset",([^\n]*)/.exec(index);
  assert.ok(resetRoute, "the reset route must exist");
  // The limiter must come first: it protects the endpoint from unauthenticated hammering too.
  assert.match(resetRoute[1], /^ adminActionLimiter, requireAuth, requireAdmin/,
    "the reset route must apply the admin limiter before authentication");
});

test("the endpoints validate the address instead of passing raw input to SQL", () => {
  const index = fs.readFileSync(INDEX, "utf8");
  const block = index.slice(index.indexOf('"/admin/accounts/login-lockout"'),
    index.indexOf('"/admin/operations/pinterest-scheduler"'));
  assert.equal((block.match(/validateEmail\(/g) || []).length, 2,
    "both handlers must validate the email before calling the RPC");
  assert.doesNotMatch(block, /req\.body\.email\s*\|\|/, "no raw fallback to an unvalidated address");
});
