const crypto = require("node:crypto");

const COOKIE_NAME = "__Host-Http-pinposy_pinterest_oauth";
const COOKIE_MAX_AGE_SECONDS = 15 * 60;

function createBrowserBinding() {
  const secret = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(secret, "utf8").digest("hex");
  return { secret, hash };
}

function readCookie(cookieHeader, name = COOKIE_NAME) {
  const parts = String(cookieHeader || "").split(";");
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

function matchesBrowserBinding(secret, expectedHash) {
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{40,50}$/.test(secret)) return false;
  if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(crypto.createHash("sha256").update(secret, "utf8").digest("hex"), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function serializeBindingCookie(secret) {
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{40,50}$/.test(secret)) {
    throw new TypeError("Invalid Pinterest OAuth browser binding");
  }
  return `${COOKIE_NAME}=${secret}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearBindingCookie() {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

module.exports = {
  COOKIE_NAME,
  createBrowserBinding,
  readCookie,
  matchesBrowserBinding,
  serializeBindingCookie,
  clearBindingCookie,
};
