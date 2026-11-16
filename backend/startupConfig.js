"use strict";

const MIN_JWT_SECRET_BYTES = 32;

function assertJwtSecret(env = process.env) {
  const secret = env && typeof env.JWT_SECRET === "string" ? env.JWT_SECRET : "";
  const secretBytes = Buffer.byteLength(secret, "utf8");
  if (secretBytes < MIN_JWT_SECRET_BYTES) {
    throw new Error("JWT_SECRET must be configured with at least 32 bytes before the API can start");
  }
  return true;
}

module.exports = { MIN_JWT_SECRET_BYTES, assertJwtSecret };
