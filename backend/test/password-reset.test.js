"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

/**
 * Password reset had no direct test, and it is the most security-sensitive public flow in the
 * product: anyone can call it with any address. The properties that matter are invisible in a
 * successful response — the request must not reveal whether an account exists, the database
 * must only ever see a hash of the reset token, the raw password must never leave the process
 * unhashed, and a token must be single-use through the SQL transaction.
 *
 * Supabase and the mailer are replaced through the require cache.
 */

const supabasePath = require.resolve("../supabase");
const mailPath = require.resolve("../mail");
const passwordResetPath = require.resolve("../password-reset");

const USER_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const state = {
  user: null,
  lookupError: null,
  rpcCalls: [],
  rpcResults: {},
  mails: [],
  mailError: null,
};

function resetState() {
  state.user = null;
  state.lookupError = null;
  state.rpcCalls = [];
  state.rpcResults = {
    issue_password_reset_token: { data: true, error: null },
    consume_password_reset_token: { data: true, error: null },
  };
  state.mails = [];
  state.mailError = null;
}

const supabaseDouble = {
  from() {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      async maybeSingle() {
        if (state.lookupError) return { data: null, error: state.lookupError };
        return { data: state.user, error: null };
      },
    };
    return builder;
  },
  async rpc(name, args) {
    state.rpcCalls.push({ name, args });
    const scripted = state.rpcResults[name];
    if (scripted === undefined) return { data: null, error: null };
    return scripted;
  },
};

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: supabaseDouble,
};

require.cache[mailPath] = {
  id: mailPath,
  filename: mailPath,
  loaded: true,
  exports: {
    transactionalMailConfigured: () => true,
    sendMail: async (message) => {
      if (state.mailError) throw state.mailError;
      state.mails.push(message);
      return { ok: true };
    },
  },
};

delete require.cache[passwordResetPath];
const { requestReset, applyReset } = require("../password-reset");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test("the reset request answers identically whether or not the account exists", async () => {
  resetState();
  state.user = null;
  const missing = await requestReset("nobody@example.com", "https://evil.example", "en");

  resetState();
  state.user = { id: USER_ID, preferred_language: "en" };
  const existing = await requestReset("somebody@example.com", "https://evil.example", "en");

  assert.deepEqual(missing, existing, "a differing answer would reveal account existence");
  assert.equal(missing.ok, true);
  // The public response must not echo the caller-supplied frontend URL either.
  assert.doesNotMatch(JSON.stringify(existing), /evil\.example/);
});

test("the database only ever sees a hash of the reset token", async () => {
  resetState();
  state.user = { id: USER_ID, preferred_language: "en" };

  await requestReset("somebody@example.com", "https://app.example", "en");

  const issue = state.rpcCalls.find((call) => call.name === "issue_password_reset_token");
  assert.ok(issue, "a token must be issued");
  const hash = issue.args.p_token_hash;
  assert.match(hash, /^[0-9a-f]{64}$/, "the stored value must be a sha256 hex digest");

  // The raw token travels only in the emailed link, never to the database.
  const mail = state.mails[0];
  assert.ok(mail, "an email must be sent");
  const token = /#token=([^&\s]+)/.exec(mail.text);
  assert.ok(token, "the email must carry the reset link");
  const raw = decodeURIComponent(token[1]);
  assert.equal(sha256(raw), hash, "the stored hash must correspond to the emailed token");
  assert.notEqual(raw, hash);
  assert.doesNotMatch(JSON.stringify(state.rpcCalls), new RegExp(raw), "the raw token must never be stored");
});

test("the email is localized and the base URL is server-side only", async () => {
  for (const [language, expectedFragment] of [["ru", "/reset-password"], ["de", "/reset-password"]]) {
    resetState();
    state.user = { id: USER_ID, preferred_language: language };
    await requestReset("somebody@example.com", "https://evil.example", "en");
    const mail = state.mails[0];
    assert.match(mail.text, new RegExp(expectedFragment));
    assert.doesNotMatch(mail.text, /evil\.example/, "a caller-supplied base URL must never be used");
  }

  // The copy differs per language, which proves preferred_language was honoured.
  resetState();
  state.user = { id: USER_ID, preferred_language: "ru" };
  await requestReset("somebody@example.com", "https://evil.example", "en");
  const russian = state.mails[0];

  resetState();
  state.user = { id: USER_ID, preferred_language: "en" };
  await requestReset("somebody@example.com", "https://evil.example", "en");
  const english = state.mails[0];

  assert.notEqual(russian.subject, english.subject);
});

test("the resend cooldown is enforced by the tokenissuing transaction", async () => {
  resetState();
  state.user = { id: USER_ID, preferred_language: "en" };

  await requestReset("somebody@example.com", "https://app.example", "en");

  const issue = state.rpcCalls.find((call) => call.name === "issue_password_reset_token");
  assert.equal(issue.args.p_min_interval_seconds, 300, "one email per five minutes per account");
  assert.equal(issue.args.p_user_id, USER_ID);
  const expires = Date.parse(issue.args.p_expires_at);
  assert.ok(Number.isFinite(expires));
  const minutes = (expires - Date.now()) / 60_000;
  assert.ok(minutes > 55 && minutes <= 61, `the token must live about an hour, got ${minutes}`);
});

test("a refused issuance sends nothing, and still answers the same", async () => {
  resetState();
  state.user = { id: USER_ID, preferred_language: "en" };
  state.rpcResults.issue_password_reset_token = { data: false, error: null };

  const response = await requestReset("somebody@example.com", "https://app.example", "en");

  assert.equal(response.ok, true);
  assert.equal(state.mails.length, 0, "a cooldown must not send a second email");
  assert.deepEqual(response, await (async () => {
    resetState();
    state.user = null;
    return requestReset("nobody@example.com", "https://app.example", "en");
  })());
});

test("a failed email send does not turn the public request into an error", async () => {
  resetState();
  state.user = { id: USER_ID, preferred_language: "en" };
  state.mailError = new Error("smtp down");

  const response = await requestReset("somebody@example.com", "https://app.example", "en");
  assert.equal(response.ok, true);
  assert.match(response.message, /Если такой email|if an account/i);
});

test("a database failure is reported as unavailability, not as a missing account", async () => {
  resetState();
  state.lookupError = { code: "08006", message: "connection failure" };

  await assert.rejects(
    () => requestReset("somebody@example.com", "https://app.example", "en"),
    (error) => error.httpStatus === 503
  );
  assert.equal(state.rpcCalls.length, 0);
});

test("applying a reset sends a bcrypt hash, never the password itself", async () => {
  resetState();

  await applyReset("raw-reset-token", "a-strong-password-1");

  const consume = state.rpcCalls.find((call) => call.name === "consume_password_reset_token");
  assert.ok(consume, "the token must be consumed");
  assert.match(consume.args.p_password_hash, /^\$2[aby]\$/, "the RPC must receive a bcrypt hash");
  assert.equal(consume.args.p_token_hash, sha256("raw-reset-token"));
  assert.equal(JSON.stringify(state.rpcCalls).includes("a-strong-password-1"), false, "the password must never be sent");
});

test("an invalid or expired reset link is a client error and changes nothing", async () => {
  resetState();
  state.rpcResults.consume_password_reset_token = { data: false, error: null };
  await assert.rejects(
    () => applyReset("stale-token", "a-strong-password-1"),
    (error) => error.httpStatus === 422
  );

  resetState();
  state.rpcResults.consume_password_reset_token = { data: null, error: { code: "XX000", message: "boom" } };
  await assert.rejects(
    () => applyReset("some-token", "a-strong-password-1"),
    (error) => error.httpStatus === 500
  );
});

test("a missing, non-string or oversized token is rejected before the database", async () => {
  for (const candidate of [undefined, null, "", 42, "x".repeat(513)]) {
    resetState();
    await assert.rejects(
      () => applyReset(candidate, "a-strong-password-1"),
      (error) => error.httpStatus === 422,
      `token ${String(candidate).slice(0, 12)} must be refused`
    );
    assert.equal(state.rpcCalls.length, 0);
  }
});

test("a weak password is refused before the token is consumed", async () => {
  resetState();
  await assert.rejects(
    () => applyReset("some-token", "short"),
    (error) => error.httpStatus === 422
  );
  assert.equal(state.rpcCalls.length, 0, "a weak password must not burn the link");
});
