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

test("fails closed when NODE_ENV is unset or not an explicit dev/test environment", () => {
  // A missing NODE_ENV is the realistic staging/container case. Granting free
  // credits there would be a money-losing fail-open.
  for (const nodeEnv of [undefined, "", "  ", "staging", "prod", "ProductionX", "development2"]) {
    const env = { ENABLE_DEV_TOPUP: "true", ADMIN_SECRET: "a".repeat(40) };
    if (nodeEnv !== undefined) env.NODE_ENV = nodeEnv;
    assert.throws(
      () => validateDevTopupRequest({ email: "u@example.com", amount: 100, adminSecret: env.ADMIN_SECRET }, env),
      /Не найдено/,
      `NODE_ENV=${String(nodeEnv)} must not enable dev top-ups`
    );
  }
});

test("accepts only the explicit development and test environments", () => {
  for (const nodeEnv of ["development", "test", " TEST ", "Development"]) {
    assert.deepEqual(
      validateDevTopupRequest({
        email: "u@example.com", amount: 5, adminSecret: "a".repeat(40),
      }, { NODE_ENV: nodeEnv, ENABLE_DEV_TOPUP: "true", ADMIN_SECRET: "a".repeat(40) }),
      { email: "u@example.com", amount: 5 },
      `NODE_ENV=${nodeEnv} is an accepted local environment`
    );
  }
});
