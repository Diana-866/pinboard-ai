"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { createState, readState, isConfigured } = require("../pinterest");
const { signSessionToken, verifySessionToken } = require("../sessionToken");

/**
 * The OAuth state is the only thing standing between a Pinterest redirect and a
 * cross-account link: the callback trusts the user id inside it. It travels in a URL
 * query string, so it is also the most exposed token this service mints.
 *
 * These tests cover what the state must refuse. Before them, nothing tested it at all.
 */
const SECRET = process.env.JWT_SECRET;
const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const BINDING = "b".repeat(64);
const USER = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function validState(overrides = {}, options = {}) {
  const payload = {
    userId: USER,
    tokenVersion: 3,
    attemptId: ATTEMPT_ID,
    generation: 1,
    browserBindingHash: BINDING,
    purpose: "pinterest_oauth",
    ...overrides,
  };
  return jwt.sign(payload, SECRET, {
    algorithm: options.algorithm || "HS256",
    expiresIn: options.expiresIn || "15m",
  });
}

test("a correctly signed state identifies its user", () => {
  const state = createState(USER, 3, ATTEMPT_ID, 1, BINDING);
  assert.equal(readState(state), USER);
});

test("a state minted for another user is read as that user only when signed", () => {
  // Reading a state is pure signature verification: the user id inside a correctly
  // signed state is trusted, and nothing else is.
  const state = createState("22222222-2222-4222-8222-222222222222", 0, ATTEMPT_ID, 2, BINDING);
  assert.equal(readState(state), "22222222-2222-4222-8222-222222222222");
  assert.notEqual(readState(state), USER);
});

test("a tampered state is refused", () => {
  const parts = createState(USER, 3, ATTEMPT_ID, 1, BINDING).split(".");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  payload.userId = "22222222-2222-4222-8222-222222222222";
  parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");

  assert.throws(
    () => readState(parts.join(".")),
    (error) => error.httpStatus === 400
  );
});

test("an expired state is refused", () => {
  const expired = jwt.sign(
    { userId: USER, attemptId: ATTEMPT_ID, generation: 1, browserBindingHash: BINDING, purpose: "pinterest_oauth" },
    SECRET,
    { algorithm: "HS256", expiresIn: "-1s" }
  );
  assert.throws(() => readState(expired), (error) => error.httpStatus === 400);
});

test("a token for another purpose is refused", () => {
  const session = signSessionToken({ id: USER, token_version: 3 }, SECRET);
  assert.throws(() => readState(session), (error) => error.httpStatus === 400);

  const wrongPurpose = validState({ purpose: "password_reset" });
  assert.throws(() => readState(wrongPurpose), (error) => error.httpStatus === 400);
});

test("a state missing any required claim is refused", () => {
  const cases = {
    purpose: undefined,
    attemptId: undefined,
    generation: undefined,
    browserBindingHash: undefined,
    userId: undefined,
  };
  for (const [claim, value] of Object.entries(cases)) {
    const token = validState({ [claim]: value });
    assert.throws(
      () => readState(token),
      (error) => error.httpStatus === 400,
      `missing ${claim} must be refused`
    );
  }
});

test("a state with a malformed attempt, generation or binding is refused", () => {
  const malformed = [
    { attemptId: "not-a-uuid" },
    { attemptId: "1111" },
    { generation: 0 },
    { generation: -1 },
    { generation: 1.5 },
    { generation: "1" },
    { browserBindingHash: "short" },
    { browserBindingHash: "g".repeat(64) },
  ];
  for (const overrides of malformed) {
    assert.throws(
      () => readState(validState(overrides)),
      (error) => error.httpStatus === 400,
      `${JSON.stringify(overrides)} must be refused`
    );
  }
});

test("a state signed with another HMAC size is refused", () => {
  // Same secret, different algorithm: the verify call pins HS256 so a token minted
  // by some other code path cannot be replayed as a state.
  const hs512 = validState({}, { algorithm: "HS512" });
  assert.throws(() => readState(hs512), (error) => error.httpStatus === 400);
});

test("an unsigned token is refused", () => {  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    userId: USER,
    attemptId: ATTEMPT_ID,
    generation: 1,
    browserBindingHash: BINDING,
    purpose: "pinterest_oauth",
  })).toString("base64url");
  assert.throws(() => readState(`${header}.${payload}.`), (error) => error.httpStatus === 400);
});

test("an empty or malformed state is refused rather than throwing something else", () => {
  for (const value of ["", null, undefined, "abc", 12345, {}]) {
    assert.throws(() => readState(value), (error) => error.httpStatus === 400);
  }
});

test("a state cannot be replayed as a session token", () => {
  // The reverse direction of the cross-purpose check in sessionToken.js.
  const state = createState(USER, 3, ATTEMPT_ID, 1, BINDING);
  assert.throws(() => verifySessionToken(state, SECRET), (error) => error.name === "JsonWebTokenError");
});

test("the integration reports itself unconfigured without all four settings", () => {
  const saved = {
    id: process.env.PINTEREST_CLIENT_ID,
    secret: process.env.PINTEREST_CLIENT_SECRET,
    redirect: process.env.PINTEREST_REDIRECT_URI,
    key: process.env.PINTEREST_TOKEN_ENCRYPTION_KEY,
  };
  try {
    process.env.PINTEREST_CLIENT_ID = "client";
    process.env.PINTEREST_CLIENT_SECRET = "secret";
    process.env.PINTEREST_REDIRECT_URI = "https://example.com/callback";
    delete process.env.PINTEREST_TOKEN_ENCRYPTION_KEY;
    assert.equal(isConfigured(), false, "encryption key is required for a usable integration");

    process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    assert.equal(isConfigured(), true);
  } finally {
    for (const [key, value] of Object.entries({
      PINTEREST_CLIENT_ID: saved.id,
      PINTEREST_CLIENT_SECRET: saved.secret,
      PINTEREST_REDIRECT_URI: saved.redirect,
      PINTEREST_TOKEN_ENCRYPTION_KEY: saved.key,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("hex case in the binding hash is equivalent, because comparison is over bytes", () => {
  // Documented on purpose: the binding is compared with timingSafeEqual over the
  // decoded bytes, so an uppercase hex claim identifies the same binding. The state
  // check therefore accepts either case and no security decision rests on it.
  const upper = validState({ browserBindingHash: "AB".repeat(32) });
  const lower = validState({ browserBindingHash: "ab".repeat(32) });
  assert.equal(readState(upper), USER);
  assert.equal(readState(lower), USER);
});
