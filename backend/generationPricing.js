"use strict";

/**
 * Reserve at least the configured per-image retail ceiling for every image.
 * Settlement rounds each image independently, so rounding only the aggregate
 * request estimate can under-reserve when count > 1.
 */
function calculateGenerationReservation(modelUnitPrice, count, markup) {
  const price = Number(modelUnitPrice);
  const quantity = Number(count);
  const multiplier = Number(markup);
  if (!Number.isFinite(price) || price <= 0) throw new TypeError("model unit price must be positive");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new TypeError("count must be an integer from 1 to 10");
  if (!Number.isFinite(multiplier) || multiplier < 1) throw new TypeError("markup must be at least 1");
  return Math.ceil(price * multiplier) * quantity;
}

module.exports = { calculateGenerationReservation };
