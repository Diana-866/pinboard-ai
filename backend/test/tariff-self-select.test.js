const test = require("node:test");
const assert = require("node:assert/strict");
const { isTariffSelfSelectEnabled } = require("../tariffSelfSelect");

test("allows tariff self-selection only in explicit development/test environments", () => {
  assert.equal(isTariffSelfSelectEnabled({ NODE_ENV: "development", ALLOW_TARIFF_SELF_SELECT: "1" }), true);
  assert.equal(isTariffSelfSelectEnabled({ NODE_ENV: "test", ALLOW_TARIFF_SELF_SELECT: "1" }), true);
  assert.equal(isTariffSelfSelectEnabled({ NODE_ENV: "development", ALLOW_TARIFF_SELF_SELECT: "0" }), false);
  assert.equal(isTariffSelfSelectEnabled({ NODE_ENV: "development" }), false);
});

test("fails closed for production, staging, and an unset NODE_ENV", () => {
  for (const NODE_ENV of ["production", "staging", undefined, "preview"]) {
    assert.equal(isTariffSelfSelectEnabled({ NODE_ENV, ALLOW_TARIFF_SELF_SELECT: "1" }), false);
  }
});
