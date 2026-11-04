const test = require("node:test");
const assert = require("node:assert/strict");
const {
  encryptToken,
  decryptToken,
  hasEncryptionKey,
  isEncryptedToken,
} = require("../pinterestTokenCrypto");

const originalKey = process.env.PINTEREST_TOKEN_ENCRYPTION_KEY;

test("Pinterest token encryption round-trips with AES-256-GCM", () => {
  process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const encrypted = encryptToken("access-token-secret");
  assert.ok(isEncryptedToken(encrypted));
  assert.notEqual(encrypted, "access-token-secret");
  assert.equal(decryptToken(encrypted), "access-token-secret");
});

test("Pinterest token encryption uses a fresh IV", () => {
  process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
  const first = encryptToken("same-token");
  const second = encryptToken("same-token");
  assert.notEqual(first, second);
  assert.equal(decryptToken(first), "same-token");
  assert.equal(decryptToken(second), "same-token");
});

test("Pinterest token encryption rejects tampering and wrong keys", () => {
  process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const encrypted = encryptToken("private-token");
  const parts = encrypted.split(":");
  parts[4] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decryptToken(parts.join(":")));
  process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 10).toString("base64");
  assert.throws(() => decryptToken(encrypted));
});

test("legacy plaintext values can be read for migration", () => {
  process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
  assert.equal(decryptToken("legacy-plaintext-token"), "legacy-plaintext-token");
});

test("missing or invalid encryption key fails closed for writes", () => {
  delete process.env.PINTEREST_TOKEN_ENCRYPTION_KEY;
  assert.equal(hasEncryptionKey(), false);
  assert.throws(() => encryptToken("must-not-be-stored-plaintext"));
  process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = "not-a-valid-key";
  assert.equal(hasEncryptionKey(), false);
  assert.throws(() => encryptToken("must-not-be-stored-plaintext"));
});

test.after(() => {
  if (originalKey === undefined) delete process.env.PINTEREST_TOKEN_ENCRYPTION_KEY;
  else process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = originalKey;
});
