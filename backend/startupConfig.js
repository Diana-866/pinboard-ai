"use strict";

const MIN_JWT_SECRET_BYTES = 32;

/** Статический код отказа конфигурации: он безопасен для журнала, в отличие от текста ошибки. */
const JWT_SECRET_MISSING = "config_jwt_secret_missing";

function assertJwtSecret(env = process.env) {
  const secret = env && typeof env.JWT_SECRET === "string" ? env.JWT_SECRET : "";
  const secretBytes = Buffer.byteLength(secret, "utf8");
  if (secretBytes < MIN_JWT_SECRET_BYTES) {
    const error = new Error("JWT_SECRET must be configured with at least 32 bytes before the API can start");
    error.code = JWT_SECRET_MISSING;
    throw error;
  }
  return true;
}

module.exports = { MIN_JWT_SECRET_BYTES, JWT_SECRET_MISSING, assertJwtSecret };
