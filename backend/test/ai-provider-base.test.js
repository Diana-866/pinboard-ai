"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveApiBase, DEFAULT_API_BASE, chooseFallbackImageModel } = require("../gptunnel");

/**
 * `AI_PROVIDER_BASE_URL` is a test seam, and a seam into a money path is a liability unless it is
 * one-way. These checks pin the direction: only an explicitly local environment may redirect the
 * provider, because the redirect also carries the API key and the customer's prompts.
 */

test("a local environment may redirect the provider address", () => {
  assert.equal(
    resolveApiBase({ NODE_ENV: "test", AI_PROVIDER_BASE_URL: "http://127.0.0.1:41234" }),
    "http://127.0.0.1:41234"
  );
  assert.equal(
    resolveApiBase({ NODE_ENV: "development", AI_PROVIDER_BASE_URL: "http://127.0.0.1:41234/" }),
    "http://127.0.0.1:41234",
    "a trailing slash must not double up in every request path"
  );
});

test("every other environment keeps the real provider, whatever the variable says", () => {
  const override = "http://attacker.example:8080";
  for (const env of [
    { NODE_ENV: "production", AI_PROVIDER_BASE_URL: override },
    { NODE_ENV: "Production ", AI_PROVIDER_BASE_URL: override },
    { NODE_ENV: "staging", AI_PROVIDER_BASE_URL: override },
    { NODE_ENV: "", AI_PROVIDER_BASE_URL: override },
    { AI_PROVIDER_BASE_URL: override },
  ]) {
    assert.equal(
      resolveApiBase(env),
      DEFAULT_API_BASE,
      `${JSON.stringify(env.NODE_ENV)} must not be able to redirect the provider`
    );
  }
  assert.equal(DEFAULT_API_BASE, "https://gptunnel.ru");
});

test("an unusable override falls back instead of breaking every AI call", () => {
  for (const value of ["", "   ", "not a url", "http://user:pass@host.test", "//host.test"]) {
    assert.equal(
      resolveApiBase({ NODE_ENV: "test", AI_PROVIDER_BASE_URL: value }),
      DEFAULT_API_BASE,
      `${JSON.stringify(value)} must fall back to the real provider`
    );
  }
  assert.equal(resolveApiBase({ NODE_ENV: "test" }), DEFAULT_API_BASE);
});

test("the image-model fallback picks the cheapest available model that accepts aspect_ratio", () => {
  // Каталог провайдера меняется: flux-schnell был снят и генерация перестала работать.
  // Замена обязана: быть другой моделью, не снятой, с положительной ценой и с aspect_ratio
  // в схеме параметров — иначе котировка не совпадёт и задача снова сломается.
  const models = [
    { id: "flux-schnell", price: 0.6, deprecated: true, params: ["aspect_ratio"] },
    { id: "expensive-with-ratio", price: 9.6, deprecated: false, params: ["aspect_ratio"] },
    { id: "cheap-with-ratio", price: 0.5, deprecated: false, params: ["aspect_ratio", "quality"] },
    { id: "cheap-no-ratio", price: 0.1, deprecated: false, params: [] },
    { id: "free-with-ratio", price: 0, deprecated: false, params: ["aspect_ratio"] },
  ];
  const pick = chooseFallbackImageModel(models, "flux-schnell");
  assert.equal(pick.id, "cheap-with-ratio");
});

test("without any usable replacement the fallback answers null, not a guess", () => {
  assert.equal(chooseFallbackImageModel([], "x"), null);
  assert.equal(chooseFallbackImageModel(null, "x"), null);
  assert.equal(chooseFallbackImageModel([
    { id: "removed", price: 1, deprecated: true, params: ["aspect_ratio"] },
  ], "x"), null);
});
