const crypto = require("crypto");

const PREFIX = "enc:v1:";

function parseEncryptionKey(rawValue, variableName) {
  const raw = String(rawValue || "").trim();
  if (!raw) throw new Error(`${variableName} is not configured`);
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${variableName} must decode to exactly 32 bytes (base64 or 64-char hex)`);
  }
  return key;
}

function encryptionKey() {
  return parseEncryptionKey(process.env.PINTEREST_TOKEN_ENCRYPTION_KEY, "PINTEREST_TOKEN_ENCRYPTION_KEY");
}

function previousEncryptionKey() {
  const raw = String(process.env.PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS || "").trim();
  return raw ? parseEncryptionKey(raw, "PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS") : null;
}

function hasEncryptionKey() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

function isEncryptedToken(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

function encryptToken(value) {
  if (value == null || value === "") return null;
  if (isEncryptedToken(value)) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

function decryptWithKey(value, key) {
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("Unsupported Pinterest token ciphertext format");
  }
  const iv = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");
  const ciphertext = Buffer.from(parts[4], "base64");
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Invalid Pinterest token ciphertext");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function decryptToken(value) {
  if (value == null || value === "") return null;
  if (!isEncryptedToken(value)) return value; // legacy plaintext, migrated by getAccount()
  const activeKey = encryptionKey();
  try {
    return decryptWithKey(value, activeKey);
  } catch (activeError) {
    const previousKey = previousEncryptionKey();
    if (!previousKey || previousKey.equals(activeKey)) throw activeError;
    // During key rotation, old ciphertext remains readable until it is lazily
    // re-encrypted with the active key when the account is next loaded.
    return decryptWithKey(value, previousKey);
  }
}

function isEncryptedWithActiveKey(value) {
  if (!isEncryptedToken(value)) return false;
  try {
    decryptWithKey(value, encryptionKey());
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  encryptionKey,
  hasEncryptionKey,
  isEncryptedToken,
  isEncryptedWithActiveKey,
  encryptToken,
  decryptToken,
};
