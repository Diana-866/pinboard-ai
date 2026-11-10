const test = require("node:test");
const assert = require("node:assert/strict");
const { createPaymentOrderId } = require("../paymentOrderId");

test("payment order IDs preserve provider prefixes and use 96-bit random suffixes", () => {
  const credit = createPaymentOrderId("ppc", "pack_100", 1794140000000);
  const subscription = createPaymentOrderId("pp", "start", 1794140000000);
  assert.match(credit, /^ppc-pack_100-1794140000000-[a-f0-9]{24}$/);
  assert.match(subscription, /^pp-start-1794140000000-[a-f0-9]{24}$/);
});

test("payment order IDs remain distinct for concurrent orders created in the same millisecond", () => {
  const ids = new Set(Array.from({ length: 1000 }, () =>
    createPaymentOrderId("ppc", "pack_500", 1794140000000)
  ));
  assert.equal(ids.size, 1000);
});

test("invalid order identity components are rejected", () => {
  for (const [prefix, product, now] of [
    ["", "pack_100", 1],
    ["ppc", "../pack", 1],
    ["ppc", "pack_100", -1],
    ["ppc", "pack_100", 1.5],
  ]) {
    assert.throws(() => createPaymentOrderId(prefix, product, now), TypeError);
  }
});
