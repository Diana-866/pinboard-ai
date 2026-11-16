import test from "node:test";
import assert from "node:assert/strict";
import { isMatchingCreditPurchaseOrder } from "./creditPurchaseOrderMatch";

test("accepts only the exact order returned by the settled purchase", () => {
  assert.equal(
    isMatchingCreditPurchaseOrder("ppc-pack_100-123-random", "ppc-pack_100-123-random"),
    true,
  );
});

test("rejects a different order even when the package and user-facing context match", () => {
  assert.equal(
    isMatchingCreditPurchaseOrder("ppc-pack_100-123-first", "ppc-pack_100-123-second"),
    false,
  );
});

test("rejects missing order identifiers", () => {
  assert.equal(isMatchingCreditPurchaseOrder(null, "ppc-pack_100-123-random"), false);
  assert.equal(isMatchingCreditPurchaseOrder("ppc-pack_100-123-random", null), false);
  assert.equal(isMatchingCreditPurchaseOrder(undefined, undefined), false);
  assert.equal(isMatchingCreditPurchaseOrder("", ""), false);
});

test("does not normalize order identifiers before comparison", () => {
  assert.equal(
    isMatchingCreditPurchaseOrder("ppc-pack_100-123-random", " ppc-pack_100-123-random"),
    false,
  );
  assert.equal(
    isMatchingCreditPurchaseOrder("ppc-pack_100-123-random", "PPC-pack_100-123-random"),
    false,
  );
});
