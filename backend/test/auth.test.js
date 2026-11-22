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
  // Each insert attempt may fail differently: the profile-column retry needs a scripted sequence.
  insertErrors: [],
  inserts: [],
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
        state.inserts.push({ ...query.pendingInsert });
        const scripted = state.insertErrors.length > 0 ? state.insertErrors.shift() : state.insertError;
        if (scripted) return Promise.resolve({ data: null, error: scripted });
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
  state.insertErrors = [];
  state.inserts = [];
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
  const result = await register("  Customer@Example.Test  ", "StrongPass123", "Анна", "Иванова", "ru", true);

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
    register("customer@example.test", "StrongPass123", "", "", "ru", true),
    (error) => error.httpStatus === 409
  );
  assert.equal(state.users.length, 1);
});

test("register refuses a weak password and an invalid email before touching the database", async () => {
  reset();
  await assert.rejects(register("customer@example.test", "123", "", "", "ru", true), (error) => error.httpStatus === 422);
  await assert.rejects(register("not-an-email", "StrongPass123", "", "", "ru", true), (error) => error.httpStatus === 422);
  assert.equal(state.users.length, 0);
});

test("register reports a database outage as 503 instead of creating a partial account", async () => {
  reset();
  state.insertError = { code: "08006", message: "connection failure" };
  await assert.rejects(register("new@example.test", "StrongPass123", "", "", "ru", true), (error) => error.httpStatus === 503);
  assert.equal(state.users.length, 0);
});

test("a missing verification email does not fail the registration", async () => {
  reset();
  issueResult = false;
  const result = await register("quiet@example.test", "StrongPass123", "", "", "en", true);
  assert.equal(result.ok, true);
  assert.equal(result.verificationEmailSent, false);
  assert.match(result.message, /не удалось|не отправлено/i, "the API must not claim a verification email was sent");
  assert.doesNotMatch(result.message, /Мы отправили письмо/i);
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

test("a database that cannot even be consulted is an outage, not a duplicate account", async () => {
  reset();
  state.lookupError = { code: "08006", message: "connection failure" };
  const error = await catchError(register("new@example.test", "StrongPass123", "", "", "en", true));
  assert.equal(error.httpStatus, 503);
  assert.equal(state.inserts.length, 0, "a failed lookup must not be followed by an insert");
});

test("two simultaneous registrations of one email end with one account and one conflict", async () => {
  reset();
  // The lookup saw nobody, so the insert is the only place that can notice the race.
  state.insertError = { code: "23505", message: "duplicate key value violates unique constraint \"users_email_key\"" };
  const error = await catchError(register("racer@example.test", "StrongPass123", "", "", "en", true));
  assert.equal(error.httpStatus, 409, "a lost race is a conflict the client can explain, not a server error");
  assert.equal(error.details && error.details.code, "email_already_registered");
  assert.equal(state.users.length, 0);
});

test("a deployment without the optional profile columns still registers the account", async () => {
  reset();
  // Migration 003 may not be applied yet: PostgREST answers 42703 naming the column.
  state.insertErrors = [{ code: "42703", message: 'column "name" does not exist' }];
  const result = await register("early@example.test", "StrongPass123", "Анна", "Иванова", "ru", true);

  assert.equal(result.needVerification, true);
  assert.equal(state.users.length, 1);
  assert.equal(state.inserts.length, 2, "the account must be retried once without the missing optional profile column");
  assert.equal(Object.hasOwn(state.inserts[1], "name"), false, "the retry must drop the missing column, not send it again");
  assert.equal(Object.hasOwn(state.inserts[1], "preferred_language"), false);
  assert.equal(typeof state.inserts[1].terms_accepted_at, "string", "the retry must preserve the consent timestamp");
  assert.ok(Number.isFinite(Date.parse(state.inserts[1].terms_accepted_at)), "the consent timestamp must be a valid ISO date");
});

test("the profile-column retry still reports a duplicate and an outage correctly", async () => {
  reset();
  state.insertErrors = [
    { code: "PGRST204", message: "Could not find the 'surname' column of 'users' in the schema cache" },
    { code: "23505", message: "duplicate key value violates unique constraint" },
  ];
  const duplicate = await catchError(register("twice@example.test", "StrongPass123", "", "Иванова", "ru", true));
  assert.equal(duplicate.httpStatus, 409);

  reset();
  state.insertErrors = [
    { code: "42703", message: 'column "preferred_language" does not exist' },
    { code: "08006", message: "connection failure" },
  ];
  const outage = await catchError(register("again@example.test", "StrongPass123", "", "", "ru", true));
  assert.equal(outage.httpStatus, 503);
  assert.equal(state.inserts.length, 2);
});

test("an insert failure that is not about a missing column is never retried", async () => {
  reset();
  // A foreign-key or any other failure must not be treated as "the schema is old": a second insert
  // could hide the real error or create partial state.
  state.insertError = { code: "23503", message: "insert or update violates foreign key constraint" };
  const error = await catchError(register("fk@example.test", "StrongPass123", "Анна", "", "ru", true));
  assert.equal(error.httpStatus, 503);
  assert.equal(state.inserts.length, 1, "exactly one insert attempt is allowed for a non-migration failure");
});

test("a missing schema column in the error text alone does not trigger the retry", async () => {
  reset();
  // The code requires both a migration-shaped code and a column name; a message alone is not proof.
  state.insertError = { code: "08006", message: 'column "name" does not exist' };
  const error = await catchError(register("mixed@example.test", "StrongPass123", "Анна", "", "ru", true));
  assert.equal(error.httpStatus, 503);
  assert.equal(state.inserts.length, 1);
});

test("an account that is being deleted cannot sign in", async () => {
  reset();
  addUser({ account_status: "pending_deletion" });
  const error = await catchError(login("customer@example.test", "StrongPass123"));
  assert.equal(error.httpStatus, 403);
  assert.equal(error.details && error.details.code, "account_pending_deletion");
  assert.equal(Object.hasOwn(error, "token"), false);
});

test("a deployment without the verification column does not lock every customer out", async () => {
  reset();
  // Before migration 005 the column is absent: `undefined` must not be read as "unverified".
  addUser({ email_verified: null });
  const result = await login("customer@example.test", "StrongPass123");
  assert.ok(result.token, "a missing column must not block sign-in for everybody");
});


test("registration fails closed when consent timestamp persistence is unavailable", async () => {
  reset();
  state.insertErrors = [{
    code: "42703",
    message: 'column "terms_accepted_at" does not exist',
  }];

  const error = await catchError(register("consent-schema-missing@example.test", "StrongPass123", "", "", "en", true));

  assert.equal(error.httpStatus, 503);
  assert.equal(state.inserts.length, 1, "must not retry by dropping the legal consent field");
  assert.equal(state.users.length, 0, "must not create an account without a persisted consent record");
  assert.deepEqual(issuedFor, [], "must not issue an email-verification token for a failed registration");
});
