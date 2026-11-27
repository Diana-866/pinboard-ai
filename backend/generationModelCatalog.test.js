"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { getAvailableImageModels } = require("./generationModelCatalog");

test("catalog includes only active image models that support aspect_ratio and sorts cheapest first", () => {
  const models = getAvailableImageModels([
    { id: "costly", price: 2, params: ["aspect_ratio"] },
    { id: "cheap", price: 0.4, params: ["aspect_ratio"] },
    { id: "no-ratio", price: 0.1, params: ["seed"] },
    { id: "deprecated", price: 0.2, params: ["aspect_ratio"], deprecated: true },
    { id: "", price: 0.2, params: ["aspect_ratio"] },
    { id: "bad-price", price: NaN, params: ["aspect_ratio"] },
  ], 1.5, (value) => Math.ceil(value));

  assert.deepEqual(models, [
    { id: "cheap", providerPrice: 0.4, creditsPerImage: 1 },
    { id: "costly", providerPrice: 2, creditsPerImage: 3 },
  ]);
});

test("catalog safely returns an empty list for malformed provider data", () => {
  assert.deepEqual(getAvailableImageModels(null, 1.5, Math.ceil), []);
  assert.deepEqual(getAvailableImageModels([{ id: "model", price: 1, params: {} }], 1.5, Math.ceil), []);
});
