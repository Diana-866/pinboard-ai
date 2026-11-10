const test = require("node:test");
const assert = require("node:assert/strict");
const { validateDevTopupRequest } = require("../devTopup");

const env = {
  NODE_ENV: "development",
  ENABLE_DEV_TOPUP: "true",
  ADMIN_SECRET: "a".repeat(40),
};

test("accepts a valid development top-up request", () => {
  assert.deepEqual(
    validateDevTopupRequest({ email: "User@example.com", amount: 100, adminSecret: env.ADMIN_SECRET }, env),
    { email: "user@example.com", amount: 100 }
  );
});

test("fails closed when ADMIN_SECRET is missing or too short", () => {
  assert.throws(() => validateDevTopupRequest({ email: "u@example.com", amount: 1 }, {
    NODE_ENV: "development", ENABLE_DEV_TOPUP: "true",
  }), /ADMIN_SECRET/);
  assert.throws(() => validateDevTopupRequest({ email: "u@example.com", amount: 1 }, {
    ...env, ADMIN_SECRET: "short",
  }), /ADMIN_SECRET/);
});

test("rejects a missing or incorrect secret", () => {
  assert.throws(() => validateDevTopupRequest({ email: "u@example.com", amount: 1 }, env), /Не авторизован/);
  assert.throws(() => validateDevTopupRequest({
    email: "u@example.com", amount: 1, adminSecret: "b".repeat(40),
  }, env), /Не авторизован/);
});

test("rejects production and disabled dev top-ups", () => {
  assert.throws(() => validateDevTopupRequest({}, { ...env, NODE_ENV: "production" }), /Не найдено/);
  assert.throws(() => validateDevTopupRequest({}, { ...env, ENABLE_DEV_TOPUP: "false" }), /Не найдено/);
});

test("rejects invalid amounts and email addresses", () => {
  for (const amount of [0, -1, 1.5, "Infinity", 100001]) {
    assert.throws(() => validateDevTopupRequest({
      email: "u@example.com", amount, adminSecret: env.ADMIN_SECRET,
    }, env));
  }
  assert.throws(() => validateDevTopupRequest({
    email: "not-an-email", amount: 1, adminSecret: env.ADMIN_SECRET,
  }, env));
});
