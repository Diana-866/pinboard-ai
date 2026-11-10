const crypto = require("node:crypto");
const { httpError, validateInt, validateEmail } = require("./validate");

function validateDevTopupRequest(body, env = process.env) {
  if (env.NODE_ENV === "production" || env.ENABLE_DEV_TOPUP !== "true") {
    throw httpError(404, "Не найдено");
  }

  const configuredSecret = env.ADMIN_SECRET;
  if (typeof configuredSecret !== "string" || configuredSecret.length < 32) {
    throw httpError(503, "Тестовое пополнение отключено: ADMIN_SECRET не настроен");
  }

  const suppliedSecret = body && body.adminSecret;
  if (typeof suppliedSecret !== "string") {
    throw httpError(401, "Не авторизован");
  }

  const expected = Buffer.from(configuredSecret, "utf8");
  const supplied = Buffer.from(suppliedSecret, "utf8");
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    throw httpError(401, "Не авторизован");
  }

  return {
    email: validateEmail(body && body.email),
    amount: validateInt(body && body.amount, {
      min: 1,
      max: 100000,
      name: "Количество кредитов",
    }),
  };
}

module.exports = { validateDevTopupRequest };
