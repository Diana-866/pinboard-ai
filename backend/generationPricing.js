"use strict";

/**
 * Round a marked-up price up to whole user credits.
 *
 * `Math.ceil` on a float product overcharges by one credit whenever the true
 * result is an integer: 50 * 1.1 === 55.00000000000001 → 56. Credit amounts are
 * money, so the product is normalized to nine-decimal precision first (well below
 * any real charge), which
 * still rounds any genuine fraction (55.4 → 56) up but keeps exact integers
 * exact.
 */
function ceilCredits(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return amount;
  return Math.ceil(Number(amount.toFixed(9)));
}

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
  return ceilCredits(price * multiplier) * quantity;
}

/**
 * Convert exact GPTunnel RUB quotes into the existing per-image user-credit
 * policy. Provider spend and user credits remain separate units.
 */
function calculateQuotedGenerationPricing(quotes, markup) {
  const multiplier = Number(markup);
  if (!Array.isArray(quotes) || quotes.length < 1 || quotes.length > 10) {
    throw new TypeError("quotes must contain from 1 to 10 image quotes");
  }
  if (!Number.isFinite(multiplier) || multiplier < 1) {
    throw new TypeError("markup must be at least 1");
  }
  const items = quotes.map((quote) => {
    if (!quote || quote.currency !== "RUB" ||
        typeof quote.price !== "number" ||
        !Number.isFinite(quote.price) || quote.price <= 0) {
      throw new TypeError("each image quote must contain a valid RUB price");
    }
    return {
      providerPriceRub: quote.price,
      userCredits: ceilCredits(quote.price * multiplier),
    };
  });
  return {
    items,
    totalProviderCostRub: items.reduce((sum, item) => sum + item.providerPriceRub, 0),
    totalUserCredits: items.reduce((sum, item) => sum + item.userCredits, 0),
  };
}

/**
 * Verify the persisted retail-credit reservation against the immutable provider
 * quote before resuming a regeneration. Database numeric columns may arrive as
 * strings, so normalize both values but never trust the stored amount alone.
 */
function validateSavedRegenerationQuote(providerPrice, savedCredits, markup) {
  const price = Number(providerPrice);
  const credits = Number(savedCredits);
  const multiplier = Number(markup);
  if (!Number.isFinite(multiplier) || multiplier < 1) {
    throw new TypeError("markup must be at least 1");
  }
  if (!Number.isFinite(price) || price <= 0) {
    throw new TypeError("saved regeneration quote price must be positive");
  }
  if (!Number.isSafeInteger(credits) || credits <= 0) {
    throw new TypeError("saved regeneration credits must be a positive safe integer");
  }
  const expectedCredits = ceilCredits(price * multiplier);
  if (!Number.isSafeInteger(expectedCredits) || credits !== expectedCredits) {
    throw new TypeError("saved regeneration credits do not match provider quote");
  }
  return credits;
}

module.exports = {
  calculateGenerationReservation,
  calculateQuotedGenerationPricing,
  ceilCredits,
  validateSavedRegenerationQuote,
};
