"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateGenerationReservation } = require("../generationPricing");

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
