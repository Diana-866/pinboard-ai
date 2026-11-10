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
      userCredits: Math.ceil(quote.price * multiplier),
    };
  });
  return {
    items,
    totalProviderCostRub: items.reduce((sum, item) => sum + item.providerPriceRub, 0),
    totalUserCredits: items.reduce((sum, item) => sum + item.userCredits, 0),
  };
}

module.exports = { calculateGenerationReservation, calculateQuotedGenerationPricing };
