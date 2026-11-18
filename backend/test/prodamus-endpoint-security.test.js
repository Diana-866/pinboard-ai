const test = require("node:test");
const assert = require("node:assert/strict");
require("./helpers/env");
const axios = require("axios");
const prodamus = require("../prodamus");

function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test("Prodamus API endpoint must use HTTPS and cannot embed credentials", async () => {
  await withEnv({ PRODAMUS_URL: "https://payments.example.test/api" }, () => {
    assert.equal(prodamus.baseUrl(), "https://payments.example.test/api/");
  });

  for (const value of [
    "http://payments.example.test/api",
    "ftp://payments.example.test/api",
    "https://user:secret@payments.example.test/api",
    "not a URL",
  ]) {
    await withEnv({ PRODAMUS_URL: value }, () => {
      assert.throws(
        () => prodamus.baseUrl(),
        (error) => error.httpStatus === 500 && /PRODAMUS_URL/.test(error.message)
      );
    });
  }
});

test("Prodamus never sends the signed checkout request to an insecure configured endpoint", async () => {
  const originalPost = axios.post;
  let providerCalls = 0;
  axios.post = async () => {
    providerCalls += 1;
    return { status: 200, data: { link: "https://payments.example.test/pay/123" } };
  };

  try {
    await withEnv({
      PRODAMUS_SECRET: "unit-test-shop-secret",
      PRODAMUS_OFFLINE: undefined,
      PRODAMUS_URL: "http://payments.example.test/api",
    }, async () => {
      await assert.rejects(
        prodamus.createPaymentLink({
          orderId: "pp-start-insecure-api-endpoint",
          amount: 1990,
          description: "PinPosy / Start",
        }),
        (error) => error.httpStatus === 500 && /PRODAMUS_URL/.test(error.message)
      );
    });
    assert.equal(providerCalls, 0, "axios must not receive a signed request over HTTP");
  } finally {
    axios.post = originalPost;
  }
});
