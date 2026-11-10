const crypto = require("node:crypto");

const PREFIX_RE = /^[a-z][a-z0-9]{0,7}$/;
const PRODUCT_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function createPaymentOrderId(prefix, productId, now = Date.now()) {
  if (typeof prefix !== "string" || !PREFIX_RE.test(prefix) ||
      typeof productId !== "string" || !PRODUCT_RE.test(productId) ||
      !Number.isSafeInteger(now) || now < 0) {
    throw new TypeError("Invalid payment order identity");
  }

  // 96 bits from the OS CSPRNG; payment identifiers are unique correlation
  // keys, not authorization tokens, but must not rely on Math.random().
  return `${prefix}-${productId}-${now}-${crypto.randomBytes(12).toString("hex")}`;
}

module.exports = { createPaymentOrderId };
