"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateGenerationReservation, calculateQuotedGenerationPricing, ceilCredits, validateSavedRegenerationQuote } = require("../generationPricing");

test("reservation rounds each image independently like settlement", () => {
  assert.equal(calculateGenerationReservation(0.6, 6, 1.5), 6);
  assert.equal(calculateGenerationReservation(1.5, 6, 1.5), 18);
});

test("reservation does not under-reserve fractional per-image prices", () => {
  assert.equal(calculateGenerationReservation(0.7, 6, 1.5), 12);
});

test("reservation handles one image and maximum batch", () => {
  assert.equal(calculateGenerationReservation(9.6, 1, 1.5), 15);
  assert.equal(calculateGenerationReservation(15, 10, 1.5), 230);
});

test("reservation rejects invalid pricing inputs", () => {
  assert.throws(() => calculateGenerationReservation(0, 1, 1.5), /price/);
  assert.throws(() => calculateGenerationReservation(1, 0, 1.5), /count/);
  assert.throws(() => calculateGenerationReservation(1, 11, 1.5), /count/);
  assert.throws(() => calculateGenerationReservation(1, 1, 0.9), /markup/);
});


test("quoted provider prices use the existing per-image credit rounding policy", () => {
  const result = calculateQuotedGenerationPricing([
    { price: 0.6, currency: "RUB" },
    { price: 0.7, currency: "RUB" },
    { price: 1.5, currency: "RUB" },
  ], 1.5);
  assert.deepEqual(result, {
    items: [
      { providerPriceRub: 0.6, userCredits: 1 },
      { providerPriceRub: 0.7, userCredits: 2 },
      { providerPriceRub: 1.5, userCredits: 3 },
    ],
    totalProviderCostRub: 2.8,
    totalUserCredits: 6,
  });
});

test("quoted pricing keeps provider RUB spend separate from user credits", () => {
  const result = calculateQuotedGenerationPricing([
    { price: 2.25, currency: "RUB" },
  ], 2);
  assert.equal(result.totalProviderCostRub, 2.25);
  assert.equal(result.totalUserCredits, 5);
});

test("quoted pricing rejects invalid quote currency, price, count and markup", () => {
  for (const quote of [
    { price: 1, currency: "USD" },
    { price: "1", currency: "RUB" },
    { price: -1, currency: "RUB" },
    { price: 0, currency: "RUB" },
    { price: Infinity, currency: "RUB" },
  ]) {
    assert.throws(() => calculateQuotedGenerationPricing([quote], 1.5), /RUB price/);
  }
  assert.throws(() => calculateQuotedGenerationPricing([], 1.5), /quotes/);
  assert.throws(() => calculateQuotedGenerationPricing(Array(11).fill({ price: 1, currency: "RUB" }), 1.5), /quotes/);
  assert.throws(() => calculateQuotedGenerationPricing([{ price: 1, currency: "RUB" }], 0.9), /markup/);
});

test("float noise in a marked-up product never charges an extra credit", () => {
  // 50 * 1.1 === 55.00000000000001 in IEEE 754; the customer owes 55, not 56.
  assert.equal(ceilCredits(50 * 1.1), 55);
  assert.equal(ceilCredits(0.1 * 3), 1);
  assert.equal(ceilCredits(1.15 * 100), 115);
  assert.equal(ceilCredits(2.25 * 2), 5);
  // A genuine fraction still rounds up.
  assert.equal(ceilCredits(55.4), 56);
  assert.equal(ceilCredits(55.0000004), 56);
  assert.equal(ceilCredits(0.000001), 1);

  const pricing = calculateQuotedGenerationPricing([
    { price: 50, currency: "RUB" },
    { price: 50, currency: "RUB" },
  ], 1.1);
  assert.equal(pricing.totalUserCredits, 110);
  assert.equal(calculateGenerationReservation(50, 2, 1.1), 110);
});


test("saved regeneration credits must match the immutable provider quote", () => {
  assert.equal(validateSavedRegenerationQuote("2.75", "5", 1.5), 5);
  assert.equal(validateSavedRegenerationQuote(2.75, 5, 1.5), 5);
  assert.throws(() => validateSavedRegenerationQuote(2.75, 4, 1.5), /do not match/);
  assert.throws(() => validateSavedRegenerationQuote(2.75, 5.5, 1.5), /safe integer/);
  assert.throws(() => validateSavedRegenerationQuote(0, 1, 1.5), /quote price/);
  assert.throws(() => validateSavedRegenerationQuote(2.75, 5, 0.5), /markup/);
});
