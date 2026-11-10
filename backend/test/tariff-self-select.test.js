const test = require("node:test");
const assert = require("node:assert/strict");
const { isTariffSelfSelectEnabled } = require("../tariffSelfSelect");

test("allows tariff self-selection only when explicitly enabled outside production", () => {
  assert.equal(isTariffSelfSelectEnabled({ NODE_ENV: "development", ALLOW_TARIFF_SELF_SELECT: "1" }), true);
  assert.equal(isTariffSelfSelectEnabled({ NODE_ENV: "test", ALLOW_TARIFF_SELF_SELECT: "1" }), true);
  assert.equal(isTariffSelfSelectEnabled({ NODE_ENV: "development", ALLOW_TARIFF_SELF_SELECT: "0" }), false);
  assert.equal(isTariffSelfSelectEnabled({ NODE_ENV: "development" }), false);
});

test("production never allows tariff self-selection, even when the flag is set", () => {
  assert.equal(isTariffSelfSelectEnabled({ NODE_ENV: "production", ALLOW_TARIFF_SELF_SELECT: "1" }), false);
  assert.equal(isTariffSelfSelectEnabled({ NODE_ENV: "production", ALLOW_TARIFF_SELF_SELECT: "0" }), false);
});
