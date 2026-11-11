require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

/**
 * Sign-up and sign-in are the only way into the product and had no tests.
 * The behaviours below are decisions the code makes deliberately (equal timing
 * for unknown accounts, password checked before the verification state, no
 * session for an unverified address), so a regression here is a security bug.
 */

// ── in-memory Supabase double ────────────────────────────────────────────────
const state = {
  users: [],
  tokens: [],
  lookups: 0,
  insertError: null,
  lookupError: null,
};

function from(table) {
  const query = {
    filters: {},
    select() { return query; },
    insert(row) {
      query.pendingInsert = row;
      return query;
    },
    eq(column, value) { query.filters[column] = value; return query; },
    order() { return query; },
    limit() { return query; },
    async maybeSingle() {
      state.lookups += 1;
      if (state.lookupError) return { data: null, error: state.lookupError };
      const rows = state[table] || [];
      const match = rows.find((row) => Object.entries(query.filters).every(([k, v]) => row[k] === v));
      return { data: match ? { ...match } : null, error: null };
    },
    single() {
      if (query.pendingInsert) {
        if (state.insertError) return Promise.resolve({ data: null, error: state.insertError });
        const row = { id: `user-${state.users.length + 1}`, ...query.pendingInsert };
        state.users.push(row);
        return Promise.resolve({ data: { ...row }, error: null });
      }
      return query.maybeSingle();
    },
  };
  return query;
}

const supabasePath = require.resolve("../supabase");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { from, rpc: async () => ({ data: null, error: null }) },
};

// email-verify is stubbed: sending mail is not what this test is about.
const emailVerifyPath = require.resolve("../email-verify");
const originalEmailVerify = require.cache[emailVerifyPath];
let issuedFor = [];
let resendWait = 0;
let issueResult = true;
require.cache[emailVerifyPath] = {
  id: emailVerifyPath,
  filename: emailVerifyPath,
  loaded: true,
  exports: {
    issueVerificationToken: async (user) => { issuedFor.push(user.email); return issueResult; },
    secondsUntilResend: async () => resendWait,
  },
};

process.env.JWT_SECRET = "auth-test-secret-at-least-32-characters";

/** assert.rejects resolves to undefined, so failures are captured explicitly. */
async function catchError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail, but it resolved");
}
const { register, login, verifyToken, MSG_NEED_VERIFY } = require("../auth");

function reset() {
  state.users = [];
  state.tokens = [];
  state.lookups = 0;
  state.insertError = null;
  state.lookupError = null;
  issuedFor = [];
  resendWait = 0;
  issueResult = true;
}

function addUser(overrides = {}) {
  const row = {
    id: `user-${state.users.length + 1}`,
    email: "customer@example.test",
    password_hash: bcrypt.hashSync("StrongPass123", 4),
    credits_balance: 20,
    email_verified: true,
    onboarded: true,
    tariff_plan: "start",
    ...overrides,
  };
  state.users.push(row);
  return row;
}

test("register normalizes the email and never returns credential material", async () => {
  reset();
  const result = await register("  Customer@Example.Test  ", "StrongPass123", "Анна", "Иванова", "ru");

  assert.equal(result.needVerification, true);
  assert.equal(result.user.email, "customer@example.test");
  assert.equal(result.user.email_verified, false);
  assert.equal(state.users.length, 1);
  assert.equal(state.users[0].email, "customer@example.test");
  assert.ok(state.users[0].password_hash.startsWith("$2"), "the stored password must be a bcrypt hash");

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /password_hash|\$2[aby]\$/, "no hash may reach the client");
  assert.doesNotMatch(serialized, /"token"/, "an unverified account must not receive a session");
  assert.deepEqual(issuedFor, ["customer@example.test"]);
});

test("register refuses a duplicate email with a conflict, not a server error", async () => {
  reset();
  addUser();
  await assert.rejects(
    register("customer@example.test", "StrongPass123", "", "", "ru"),
    (error) => error.httpStatus === 409
  );
  assert.equal(state.users.length, 1);
});

test("register refuses a weak password and an invalid email before touching the database", async () => {
  reset();
  await assert.rejects(register("customer@example.test", "123", "", "", "ru"), (error) => error.httpStatus === 422);
  await assert.rejects(register("not-an-email", "StrongPass123", "", "", "ru"), (error) => error.httpStatus === 422);
  assert.equal(state.users.length, 0);
});

test("register reports a database outage as 503 instead of creating a partial account", async () => {
  reset();
  state.insertError = { code: "08006", message: "connection failure" };
  await assert.rejects(register("new@example.test", "StrongPass123", "", "", "ru"), (error) => error.httpStatus === 503);
  assert.equal(state.users.length, 0);
});

test("a missing verification email does not fail the registration", async () => {
  reset();
  issueResult = false;
  const result = await register("quiet@example.test", "StrongPass123", "", "", "en");
  assert.equal(result.ok, true);
  assert.equal(result.verificationEmailSent, false);
});

test("login returns a session for a verified account", async () => {
  reset();
  addUser();
  const result = await login("customer@example.test", "StrongPass123");
  assert.ok(result.token);
  assert.equal(result.user.email, "customer@example.test");
  assert.equal(result.user.credits_balance, 20);
  assert.equal(result.user.email_verified, true);

  const payload = verifyToken(result.token);
  assert.equal(payload.userId, "user-1");
});

test("a wrong password and an unknown email are indistinguishable", async () => {
  reset();
  addUser();

  const wrongPassword = await catchError(login("customer@example.test", "WrongPass123"));
  const unknownEmail = await catchError(login("nobody@example.test", "WrongPass123"));

  assert.equal(wrongPassword.httpStatus, 401);
  assert.equal(unknownEmail.httpStatus, 401);
  assert.equal(wrongPassword.message, unknownEmail.message);
});

test("an unverified account gets no session and a throttled resend", async () => {
  reset();
  addUser({ email_verified: false });

  const error = await catchError(login("customer@example.test", "StrongPass123"));
  assert.equal(error.httpStatus, 403);
  assert.equal(error.message, MSG_NEED_VERIFY);
  assert.equal(error.details.code, "email_not_verified");
  assert.equal(error.details.emailSent, true);

  // Inside the throttle window no second mail is sent, but the client is told when to retry.
  reset();
  addUser({ email_verified: false });
  resendWait = 120;
  const throttled = await catchError(login("customer@example.test", "StrongPass123"));
  assert.equal(throttled.details.emailSent, false);
  assert.equal(throttled.details.retryAfterSeconds, 120);
  assert.deepEqual(issuedFor, []);
});

test("the password is checked before the verification state", async () => {
  reset();
  addUser({ email_verified: false });
  // A wrong password on an unverified account must look like any other bad login,
  // otherwise 403 would reveal that the address exists.
  const error = await catchError(login("customer@example.test", "WrongPass123"));
  assert.equal(error.httpStatus, 401);
});

test("login surfaces a database failure as 503 rather than a bad password", async () => {
  reset();
  addUser();
  state.lookupError = { message: "connection failure" };
  await assert.rejects(login("customer@example.test", "StrongPass123"), (error) => error.httpStatus === 503);
});

test("verifyToken rejects a token signed with another secret", () => {
  const valid = require("../sessionToken").signSessionToken({ id: "user-1", email: "a@b.test" }, "another-secret-at-least-32-characters");
  assert.throws(() => verifyToken(valid));
});

test.after(() => {
  if (originalEmailVerify) require.cache[emailVerifyPath] = originalEmailVerify;
  else delete require.cache[emailVerifyPath];
});
