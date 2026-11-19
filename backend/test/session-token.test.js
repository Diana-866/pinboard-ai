const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const {
  SESSION_ALGORITHM,
  signSessionToken,
  verifySessionToken,
} = require("../sessionToken");

const secret = "test-session-secret-that-is-long-enough-for-hmac";

test("session tokens are signed with the pinned HS256 algorithm", () => {
  const token = signSessionToken({ id: "user-123", token_version: 4 }, secret);
  const decoded = jwt.decode(token, { complete: true });

  assert.equal(decoded.header.alg, SESSION_ALGORITHM);
  assert.deepEqual(
    { userId: decoded.payload.userId, tokenVersion: decoded.payload.tokenVersion },
    { userId: "user-123", tokenVersion: 4 }
  );
  assert.equal(verifySessionToken(token, secret).userId, "user-123");
});

test("session verification rejects tokens signed with a different HMAC algorithm", () => {
  const token = jwt.sign(
    { userId: "user-123", tokenVersion: 0 },
    secret,
    { algorithm: "HS384", expiresIn: "7d" }
  );

  assert.throws(
    () => verifySessionToken(token, secret),
    (error) => error && error.name === "JsonWebTokenError"
  );
});

test("session verification rejects tampered tokens", () => {
  const token = signSessionToken({ id: "user-123", token_version: 0 }, secret);
  const parts = token.split(".");
  parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1);

  assert.throws(() => verifySessionToken(parts.join("."), secret));
});

test("session tokens carry an explicit purpose claim", () => {
  const token = signSessionToken({ id: "user-123", token_version: 0 }, secret);
  assert.equal(jwt.decode(token).purpose, "session");
});

test("a token minted for another purpose is not a session", () => {
  // The Pinterest OAuth state is signed with the same secret and carries userId plus
  // tokenVersion, so it used to satisfy requireAuth for 15 minutes while sitting in a
  // URL query string. requireAuth reads only userId/tokenVersion, which made the state
  // a second, much leakier session credential.
  const stateLike = jwt.sign(
    {
      userId: "user-123",
      tokenVersion: 4,
      attemptId: "11111111-1111-4111-8111-111111111111",
      generation: 1,
      browserBindingHash: "a".repeat(64),
      purpose: "pinterest_oauth",
    },
    secret,
    { algorithm: SESSION_ALGORITHM, expiresIn: "15m" }
  );

  assert.throws(
    () => verifySessionToken(stateLike, secret),
    (error) => error && error.name === "JsonWebTokenError"
  );
});

test("tokens issued before the purpose claim still work", () => {
  // No mass sign-out: a legacy token has no purpose claim at all.
  const legacy = jwt.sign(
    { userId: "user-123", tokenVersion: 2 },
    secret,
    { algorithm: SESSION_ALGORITHM, expiresIn: "7d" }
  );

  const decoded = verifySessionToken(legacy, secret);
  assert.equal(decoded.userId, "user-123");
  assert.equal(decoded.tokenVersion, 2);
});

test("an unexpected purpose value is rejected, not ignored", () => {
  for (const purpose of ["", "Session", "admin", null]) {
    const token = jwt.sign({ userId: "user-123", tokenVersion: 0, purpose }, secret, {
      algorithm: SESSION_ALGORITHM,
      expiresIn: "7d",
    });
    assert.throws(
      () => verifySessionToken(token, secret),
      (error) => error && error.name === "JsonWebTokenError",
      `purpose ${JSON.stringify(purpose)} must be refused`
    );
  }
});
