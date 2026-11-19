"use strict";

const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

/**
 * Durable per-account login lockout (migration 164).
 *
 * The project already had two in-memory limits on /login (per address since the beginning, per
 * account since §54), but a counter in one process multiplies with the number of instances and
 * resets on restart. This is the durable half: the count and the lock live on the user row.
 *
 * Two properties matter most and are pinned here:
 *   1. A locked account does not reach the password comparison at all (no oracle, no bcrypt cost).
 *   2. The answer to a wrong password stays "invalid credentials" even when that attempt is the
 *      one that locked the account, so the endpoint never confirms an address.
 */

const PASSWORD = "CorrectHorse123";
const HASH = bcrypt.hashSync(PASSWORD, 4);

function user(overrides = {}) {
  return {
    id: "user-1",
    email: "victim@example.invalid",
    password_hash: HASH,
    email_verified: true,
    account_status: "active",
    credits_balance: 3,
    tariff_plan: "start",
    onboarded: true,
    token_version: 0,
    ...overrides,
  };
}

/** A Supabase double with a lock-state map, so the lockout behaves like the SQL does. */
function createDb({ users = [user()], missingMigration = false, failRpc = null } = {}) {
  const state = { lockedUntil: new Map(), failures: new Map(), userQueries: 0, rpcCalls: [] };

  function from(table) {
    state.userQueries += 1;
    const filter = {};
    const builder = {
      select() { return builder; },
      eq(column, value) { filter[column] = value; return builder; },
      maybeSingle() {
        const row = table === "users"
          ? users.find((candidate) => candidate.email === filter.email) || null
          : null;
        // PostgREST maybeSingle() answers zero rows with data null and no error; only a broken
        // request produces an error, and login() treats that as 503.
        return Promise.resolve({ data: row, error: null });
      },
      single() { return builder.maybeSingle(); },
    };
    return builder;
  }

  function rpc(name, args) {
    state.rpcCalls.push({ name, args });
    if (missingMigration) return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    if (failRpc) return Promise.resolve({ data: null, error: failRpc });
    const email = String(args.p_email || "").toLowerCase();
    const failedAttempts = state.failures.get(email) || 0;
    if (name === "login_lock_state") {
      const until = state.lockedUntil.get(email);
      const locked = !!until && until > Date.now();
      return Promise.resolve({
        data: { locked, failed_attempts: failedAttempts, retry_after_seconds: locked ? Math.ceil((until - Date.now()) / 1000) : 0 },
        error: null,
      });
    }
    if (name === "record_failed_login") {
      const next = failedAttempts + 1;
      state.failures.set(email, next);
      if (next >= Number(args.p_max_attempts)) {
        state.lockedUntil.set(email, Date.now() + Number(args.p_lock_seconds) * 1000);
      }
      const until = state.lockedUntil.get(email);
      const locked = !!until && until > Date.now();
      return Promise.resolve({
        data: { locked, failed_attempts: next, retry_after_seconds: locked ? Math.ceil((until - Date.now()) / 1000) : 0 },
        error: null,
      });
    }
    if (name === "clear_login_failures") {
      // The RPC is keyed on the user id, not the address.
      const target = users.find((candidate) => candidate.id === String(args.p_user_id));
      const key = target ? String(target.email).toLowerCase() : email;
      state.failures.set(key, 0);
      state.lockedUntil.delete(key);
      return Promise.resolve({ data: true, error: null });
    }
    return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
  }

  return { state, from, rpc };
}

function load(db) {
  const supabasePath = require.resolve("../supabase");
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: db };
  for (const relative of ["../auth", "../loginLockout", "../email-verify"]) {
    delete require.cache[require.resolve(relative)];
  }
  return { auth: require("../auth"), loginLockout: require("../loginLockout") };
}

test("a locked account is refused before the password is even looked at", async () => {
  const db = createDb();
  const { auth } = load(db);
  db.state.lockedUntil.set("victim@example.invalid", Date.now() + 600_000);

  await assert.rejects(() => auth.login("victim@example.invalid", PASSWORD), (error) => {
    assert.equal(error.httpStatus, 429);
    assert.equal(error.details.code, "login_locked");
    assert.ok(error.details.retryAfterSeconds > 0, "the client must receive a wait it can show");
    assert.match(error.message, /мин/, "the message states the wait in minutes");
    return true;
  });
  assert.equal(db.state.userQueries, 0, "a locked account must not reach the user lookup");
});

test("a wrong password answers invalid_credentials and counts the failure", async () => {
  const db = createDb();
  const { auth } = load(db);

  await assert.rejects(() => auth.login("victim@example.invalid", "WrongPassword1"), (error) => {
    assert.equal(error.httpStatus, 401);
    assert.equal(error.details.code, "invalid_credentials",
      "the response must not reveal that this attempt was the locking one");
    return true;
  });
  assert.equal(db.state.failures.get("victim@example.invalid"), 1);
});

test("the attempt that reaches the ceiling is still answered as a plain wrong password", async () => {
  const db = createDb();
  const { auth } = load(db);
  db.state.failures.set("victim@example.invalid", 4);

  await assert.rejects(() => auth.login("victim@example.invalid", "WrongPassword1"),
    (error) => error.httpStatus === 401 && error.details.code === "invalid_credentials");
  assert.ok(db.state.lockedUntil.get("victim@example.invalid") > Date.now(), "the account is now locked");

  // The next attempt, even with the right password, is refused with the wait.
  await assert.rejects(() => auth.login("victim@example.invalid", PASSWORD),
    (error) => error.httpStatus === 429 && error.details.code === "login_locked");
});

test("an unknown address is never counted, so it cannot be distinguished", async () => {
  const db = createDb();
  const { auth } = load(db);

  await assert.rejects(() => auth.login("nobody@example.invalid", PASSWORD),
    (error) => error.httpStatus === 401 && error.details.code === "invalid_credentials");
  assert.equal(db.state.failures.get("nobody@example.invalid"), undefined,
    "nothing may be recorded for an address that does not exist");
  assert.equal(db.state.rpcCalls.filter((call) => call.name === "record_failed_login").length, 0);
});

test("a correct password clears the counter and signs in", async () => {
  const db = createDb();
  const { auth } = load(db);
  db.state.failures.set("victim@example.invalid", 3);

  const result = await auth.login("victim@example.invalid", PASSWORD);
  assert.ok(result.token, "the session token is issued");
  assert.equal(result.user.email, "victim@example.invalid");
  assert.equal(db.state.failures.get("victim@example.invalid"), 0);
  assert.ok(db.state.rpcCalls.some((call) => call.name === "clear_login_failures"));
});

test("a deployment without migration 164 keeps working on the in-memory limits alone", async () => {
  const db = createDb({ missingMigration: true });
  const { auth, loginLockout } = load(db);

  assert.equal(loginLockout.isMissingFeature({ code: "PGRST202" }), true);
  assert.equal(loginLockout.isMissingFeature({ message: "function public.login_lock_state(text) does not exist" }), true);
  assert.equal(loginLockout.isMissingFeature({ code: "08006", message: "connection failure" }), false);

  const result = await auth.login("victim@example.invalid", PASSWORD);
  assert.ok(result.token, "login must not break before the migration is applied");

  await assert.rejects(() => auth.login("victim@example.invalid", "WrongPassword1"),
    (error) => error.httpStatus === 401, "a wrong password is still a wrong password");
});

test("a real database failure fails closed instead of silently dropping the lockout", async () => {
  const db = createDb({ failRpc: { code: "08006", message: "connection failure" } });
  const { auth } = load(db);

  await assert.rejects(() => auth.login("victim@example.invalid", PASSWORD),
    (error) => error.httpStatus === 503 && /временно недоступен/.test(error.message));
});

test("the lockout length and ceiling are configured with sane bounds", async () => {
  const db = createDb();
  const { loginLockout } = load(db);
  const previousMax = process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS;
  const previousSeconds = process.env.LOGIN_LOCKOUT_SECONDS;
  try {
    delete process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS;
    delete process.env.LOGIN_LOCKOUT_SECONDS;
    assert.equal(loginLockout.maxAttempts(), 5, "the default ceiling is five attempts");
    assert.equal(loginLockout.lockSeconds(), 900, "the default lock is fifteen minutes");

    process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS = "0";
    assert.equal(loginLockout.maxAttempts(), 5, "zero is not a ceiling");
    process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS = "500";
    assert.equal(loginLockout.maxAttempts(), 50, "the ceiling is clamped");
    process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS = "3";
    assert.equal(loginLockout.maxAttempts(), 3);

    process.env.LOGIN_LOCKOUT_SECONDS = "-1";
    assert.equal(loginLockout.lockSeconds(), 900);
    process.env.LOGIN_LOCKOUT_SECONDS = String(30 * 24 * 60 * 60);
    assert.equal(loginLockout.lockSeconds(), 24 * 60 * 60, "a lockout may not be longer than a day");
  } finally {
    if (previousMax === undefined) delete process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS;
    else process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS = previousMax;
    if (previousSeconds === undefined) delete process.env.LOGIN_LOCKOUT_SECONDS;
    else process.env.LOGIN_LOCKOUT_SECONDS = previousSeconds;
  }
});

test("the configured values are the ones sent to the database", async () => {
  const db = createDb();
  const { loginLockout } = load(db);
  process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS = "7";
  process.env.LOGIN_LOCKOUT_SECONDS = "120";
  try {
    await loginLockout.recordFailure("victim@example.invalid");
    const call = db.state.rpcCalls.find((entry) => entry.name === "record_failed_login");
    assert.equal(call.args.p_max_attempts, 7);
    assert.equal(call.args.p_lock_seconds, 120);
  } finally {
    delete process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS;
    delete process.env.LOGIN_LOCKOUT_SECONDS;
  }
});

test("a malformed state answer is treated as 'not locked' and never as a crash", async () => {
  const db = createDb();
  const { loginLockout } = load(db);
  const degenerate = {
    rpc: async () => ({ data: { locked: "yes", failed_attempts: -4, retry_after_seconds: "soon" }, error: null }),
  };
  const state = await loginLockout.lockState("victim@example.invalid", degenerate);
  assert.deepEqual(state, { locked: false, failedAttempts: 0, retryAfterSeconds: 0 });
});
