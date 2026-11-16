"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAdminSubscriptionLimit } = require("../billing");

test("admin subscription inventory limit is clamped to 1..500", () => {
  assert.equal(normalizeAdminSubscriptionLimit(undefined), 100);
  assert.equal(normalizeAdminSubscriptionLimit("20"), 20);
  assert.equal(normalizeAdminSubscriptionLimit(0), 1);
  assert.equal(normalizeAdminSubscriptionLimit(-5), 1);
  assert.equal(normalizeAdminSubscriptionLimit(1000000), 500);
  assert.equal(normalizeAdminSubscriptionLimit("invalid"), 100);
});
