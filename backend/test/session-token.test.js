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
