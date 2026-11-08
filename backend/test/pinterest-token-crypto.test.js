const test = require("node:test");
const assert = require("node:assert/strict");
const {
  encryptToken,
  decryptToken,
  hasEncryptionKey,
  isEncryptedToken,
  isEncryptedWithActiveKey,
} = require("../pinterestTokenCrypto");

const originalKey = process.env.PINTEREST_TOKEN_ENCRYPTION_KEY;
const originalPreviousKey = process.env.PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS;

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

test("previous encryption key can decrypt old tokens during rotation", () => {
  process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 12).toString("base64");
  process.env.PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS = Buffer.alloc(32, 13).toString("base64");
  const oldCiphertext = (() => {
    process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString("base64");
    const value = encryptToken("token-before-rotation");
    process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 12).toString("base64");
    return value;
  })();
  assert.equal(decryptToken(oldCiphertext), "token-before-rotation");
  assert.equal(isEncryptedWithActiveKey(oldCiphertext), false);
  const reencrypted = encryptToken(decryptToken(oldCiphertext));
  assert.equal(decryptToken(reencrypted), "token-before-rotation");
  assert.equal(isEncryptedWithActiveKey(reencrypted), true);
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

  const validBase64 = Buffer.alloc(32, 21).toString("base64");
  process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = validBase64 + "!";
  assert.equal(hasEncryptionKey(), false);
  assert.throws(() => encryptToken("must-not-be-stored-plaintext"));

  process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = validBase64.slice(0, -2) + "!!";
  assert.equal(hasEncryptionKey(), false);
  assert.throws(() => encryptToken("must-not-be-stored-plaintext"));

  // Canonical unpadded Base64 is accepted for deployment environments that
  // omit trailing padding, while malformed encodings are rejected.
  process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = validBase64.replace(/=+$/, "");
  assert.equal(hasEncryptionKey(), true);
});

test.after(() => {
  if (originalKey === undefined) delete process.env.PINTEREST_TOKEN_ENCRYPTION_KEY;
  else process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = originalKey;
  if (originalPreviousKey === undefined) delete process.env.PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS;
  else process.env.PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS = originalPreviousKey;
});
