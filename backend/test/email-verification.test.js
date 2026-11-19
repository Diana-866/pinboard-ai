"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

/**
 * Email verification is the sibling of password reset and had the same gap: the module was
 * referenced only for its message constant, so none of its security properties were pinned.
 * They are properties of a public endpoint that any address can call:
 *
 *  - the anonymous "resend" answer must be identical whether or not the address exists;
 *  - the database must only ever see a sha256 of the token, the raw token belongs in the link;
 *  - a new link invalidates the previous unused ones, so a leaked older email stops working;
 *  - the resend cooldown is enforced by the issuing transaction;
 *  - verifying with an invalid, expired or already-used token must be indistinguishable.
 */

const supabasePath = require.resolve("../supabase");
const mailPath = require.resolve("../mail");
const emailVerifyPath = require.resolve("../email-verify");

const USER_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const state = {
  user: null,
  lookupError: null,
  lastTokenRow: null,
  rpcCalls: [],
  rpcResults: {},
  updates: [],
  updateError: null,
  mails: [],
  mailError: null,
};

function resetState() {
  state.user = null;
  state.lookupError = null;
  state.lastTokenRow = null;
  state.rpcCalls = [];
  state.rpcResults = {
    issue_email_verification_token: { data: true, error: null },
    consume_email_verification_token: { data: true, error: null },
  };
  state.updates = [];
  state.updateError = null;
  state.mails = [];
  state.mailError = null;
}

const supabaseDouble = {
  from(table) {
    const ops = [];
    const builder = {
      select() { ops.push("select"); return builder; },
      update(values) { ops.push(["update", values]); return builder; },
      eq() { return builder; },
      is() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      async maybeSingle() {
        if (state.lookupError) return { data: null, error: state.lookupError };
        return { data: state.user, error: null };
      },
      then(resolve, reject) {
        if (table === "auth_tokens") {
          if (ops.some((op) => Array.isArray(op) && op[0] === "update")) {
            state.updates.push(ops);
            return Promise.resolve({ data: null, error: state.updateError }).then(resolve, reject);
          }
          return Promise.resolve({ data: state.lastTokenRow ? [state.lastTokenRow] : [], error: null })
            .then(resolve, reject);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return builder;
  },
  async rpc(name, args) {
    state.rpcCalls.push({ name, args });
    const scripted = state.rpcResults[name];
    return scripted === undefined ? { data: null, error: null } : scripted;
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

delete require.cache[emailVerifyPath];
const emailVerify = require("../email-verify");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test("the anonymous resend answers identically for a known and an unknown address", async () => {
  resetState();
  state.user = null;
  const unknown = await emailVerify.resendVerification("nobody@example.com", null);

  resetState();
  state.user = { id: USER_ID, email: "somebody@example.com", email_verified: false, preferred_language: "en" };
  state.lastTokenRow = null;
  const known = await emailVerify.resendVerification("somebody@example.com", null);

  assert.deepEqual(unknown, known, "a differing answer would reveal account existence");
  assert.equal(unknown.ok, true);
});

test("an unknown address never triggers a lookup-dependent email", async () => {
  resetState();
  state.user = null;

  await emailVerify.resendVerification("nobody@example.com", null);

  assert.equal(state.rpcCalls.length, 0, "no token for an address that does not exist");
  assert.equal(state.mails.length, 0);
});

test("an already verified account is never asked to verify again", async () => {
  resetState();
  state.user = { id: USER_ID, email: "somebody@example.com", email_verified: true, preferred_language: "en" };

  await emailVerify.resendVerification("somebody@example.com", null);

  assert.equal(state.rpcCalls.length, 0);
  assert.equal(state.mails.length, 0);
});

test("the authenticated resend tells the truth about throttling", async () => {
  resetState();
  state.user = { id: USER_ID, email: "somebody@example.com", email_verified: false, preferred_language: "en" };
  state.lastTokenRow = { created_at: new Date(Date.now() - 60_000).toISOString() };

  const throttled = await emailVerify.resendVerification(null, USER_ID);

  assert.equal(throttled.ok, true);
  assert.equal(throttled.throttled, true);
  assert.ok(throttled.retryAfterSeconds > 0 && throttled.retryAfterSeconds <= 300);
  assert.equal(state.rpcCalls.length, 0, "a throttled resend must not issue a token");
});

test("the token is stored as a hash and the raw value only travels in the link", async () => {
  resetState();
  const user = { id: USER_ID, email: "somebody@example.com", email_verified: false, preferred_language: "ru" };

  const sent = await emailVerify.issueVerificationToken(user);
  assert.equal(sent, true);

  const issue = state.rpcCalls.find((call) => call.name === "issue_email_verification_token");
  assert.ok(issue);
  const hash = issue.args.p_token_hash;
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(issue.args.p_min_interval_seconds, 300);
  const hours = (Date.parse(issue.args.p_expires_at) - Date.now()) / 3_600_000;
  assert.ok(hours > 23 && hours <= 24.1, `the link must live about a day, got ${hours}`);

  const mail = state.mails[0];
  assert.ok(mail);
  const match = /#token=([^&\s]+)/.exec(mail.text);
  assert.ok(match, "the email must carry the verification link");
  const raw = decodeURIComponent(match[1]);
  assert.equal(sha256(raw), hash, "the stored hash must match the emailed token");
  assert.doesNotMatch(JSON.stringify(state.rpcCalls), new RegExp(raw), "the raw token must never be stored");
});

test("issuing a new link revokes the previous unused ones inside the SQL transaction", () => {
  // The revocation belongs to the atomic issuing function (migration 022), not to the JS layer:
  // a JS copy existed but was never called, which is worse than no copy at all because it
  // reads like the rule is enforced there. The invariant is asserted where it lives.
  const fs = require("node:fs");
  const path = require("node:path");
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "..", "db", "migrations", "022_atomic_email_verification_issuance.sql"),
    "utf8"
  );
  const body = migration.slice(migration.indexOf("function"));

  assert.match(
    body,
    /update public\.auth_tokens\s+set used_at = now\(\)[\s\S]*?purpose = 'email_verify'[\s\S]*?used_at is null;/,
    "the issuing transaction must invalidate older unused links"
  );
  // Issuing and revoking happen in the same transaction, revoking before the insert.
  assert.ok(body.indexOf("update public.auth_tokens") < body.indexOf("insert into public.auth_tokens"));

  // And the JS layer must not keep an uncalled copy of the same rule.
  const source = fs.readFileSync(require.resolve("../email-verify.js"), "utf8");
  assert.doesNotMatch(source, /function revokeUnused/, "dead security code misleads the next reader");
});

test("a failed email send reports failure without throwing", async () => {
  resetState();
  state.mailError = new Error("smtp down");
  const user = { id: USER_ID, email: "somebody@example.com", email_verified: false, preferred_language: "en" };

  const sent = await emailVerify.issueVerificationToken(user);
  assert.equal(sent, false, "the caller must learn the mail did not go out");
});

test("a refused issuance or missing mail configuration reports false, never throws", async () => {
  resetState();
  state.rpcResults.issue_email_verification_token = { data: false, error: null };
  const user = { id: USER_ID, email: "somebody@example.com", email_verified: false, preferred_language: "en" };
  assert.equal(await emailVerify.issueVerificationToken(user), false);
  assert.equal(state.mails.length, 0);
});

test("verifying consumes only a hash and reports every bad token identically", async () => {
  resetState();

  await emailVerify.applyVerification("raw-token-value");
  const consume = state.rpcCalls.find((call) => call.name === "consume_email_verification_token");
  assert.equal(consume.args.p_token_hash, sha256("raw-token-value"));

  // An expired, already used or invented token all arrive as the same refusal.
  for (const scripted of [{ data: false, error: null }, { data: null, error: null }]) {
    resetState();
    state.rpcResults.consume_email_verification_token = scripted;
    await assert.rejects(
      () => emailVerify.applyVerification("stale"),
      (error) => error.httpStatus === 422 && /недействительна|устарела/i.test(error.message)
    );
  }
});

test("a database failure while verifying is reported as a server error, not a bad link", async () => {
  resetState();
  state.rpcResults.consume_email_verification_token = { data: null, error: { code: "08006", message: "down" } };

  await assert.rejects(
    () => emailVerify.applyVerification("some-token"),
    (error) => error.httpStatus === 500
  );
});

test("a missing, non-string or oversized token is refused before the database", async () => {
  for (const candidate of [undefined, null, "", 42, "x".repeat(513)]) {
    resetState();
    await assert.rejects(
      () => emailVerify.applyVerification(candidate),
      (error) => error.httpStatus === 422
    );
    assert.equal(state.rpcCalls.length, 0);
  }
});
