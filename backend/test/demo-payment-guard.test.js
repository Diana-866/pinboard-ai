require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.PRODAMUS_SHOP_ID = "pinposy";
process.env.PRODAMUS_SECRET = "unit-test-secret";

const prodamus = require("../prodamus");

function withEnv(patch, run) {
  const previous = {};
  for (const key of Object.keys(patch)) {
    previous[key] = process.env[key];
    if (patch[key] === undefined) delete process.env[key];
    else process.env[key] = patch[key];
  }
  try {
    return run();
  } finally {
    for (const key of Object.keys(patch)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("demo payments may grant entitlements only in an explicitly local environment", () => {
  withEnv({ PRODAMUS_DEMO: "1", NODE_ENV: "production" }, () => {
    assert.equal(prodamus.isDemo(), true);
    assert.equal(prodamus.isDemoWebhookBlocked(), true);
  });

  withEnv({ PRODAMUS_DEMO: "1", NODE_ENV: "development" }, () => {
    assert.equal(prodamus.isDemoWebhookBlocked(), false, "local end-to-end testing stays possible");
  });

  withEnv({ PRODAMUS_DEMO: "1", NODE_ENV: "test" }, () => {
    assert.equal(prodamus.isDemoWebhookBlocked(), false, "automated tests stay possible");
  });

  // Staging and any deployment that never set NODE_ENV must not hand out real
  // entitlements from a demo payment form.
  for (const nodeEnv of ["", "staging", "prod"]) {
    withEnv({ PRODAMUS_DEMO: "1", NODE_ENV: nodeEnv }, () => {
      assert.equal(
        prodamus.isDemoWebhookBlocked(),
        true,
        `NODE_ENV=${nodeEnv} must block demo entitlement grants`
      );
    });
  }

  withEnv({ PRODAMUS_DEMO: undefined, NODE_ENV: "production" }, () => {
    assert.equal(prodamus.isDemo(), false);
    assert.equal(prodamus.isDemoWebhookBlocked(), false, "live payments are unaffected");
  });
});
