"use strict";

require("./helpers/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveServiceBaseUrl } = require("../serviceBaseUrl");
const { resolvePinterestApiBase, DEFAULT_API_BASE: PINTEREST_DEFAULT } = require("../pinterest");
const { resolveApiBase, DEFAULT_API_BASE: AI_DEFAULT } = require("../gptunnel");

const OPTIONS = { variable: "SOME_BASE_URL", defaultBase: "https://real.example" };

test("without an override the real address is used", () => {
  assert.equal(resolveServiceBaseUrl({ ...OPTIONS, env: {} }), "https://real.example");
  assert.equal(resolveServiceBaseUrl({ ...OPTIONS, env: { NODE_ENV: "test", SOME_BASE_URL: "" } }), "https://real.example");
  assert.equal(resolveServiceBaseUrl({ ...OPTIONS, env: { NODE_ENV: "test", SOME_BASE_URL: "   " } }), "https://real.example");
});

test("the override is honoured only in development and test", () => {
  for (const nodeEnv of ["development", "test", "TEST", " Development "]) {
    assert.equal(
      resolveServiceBaseUrl({ ...OPTIONS, env: { NODE_ENV: nodeEnv, SOME_BASE_URL: "http://127.0.0.1:1234" } }),
      "http://127.0.0.1:1234",
      `NODE_ENV=${nodeEnv}`
    );
  }
  for (const nodeEnv of ["production", "staging", "preview", "", undefined]) {
    assert.equal(
      resolveServiceBaseUrl({ ...OPTIONS, env: { NODE_ENV: nodeEnv, SOME_BASE_URL: "http://127.0.0.1:1234" } }),
      "https://real.example",
      `NODE_ENV=${String(nodeEnv)} must not be redirected`
    );
  }
});

test("a trailing slash is trimmed and a usable address is kept as written", () => {
  assert.equal(
    resolveServiceBaseUrl({ ...OPTIONS, env: { NODE_ENV: "test", SOME_BASE_URL: "http://127.0.0.1:1234///" } }),
    "http://127.0.0.1:1234"
  );
  assert.equal(
    resolveServiceBaseUrl({ ...OPTIONS, env: { NODE_ENV: "test", SOME_BASE_URL: "http://127.0.0.1:1234/v5" } }),
    "http://127.0.0.1:1234/v5"
  );
});

test("an unusable override falls back to the real address instead of breaking every call", () => {
  for (const value of [
    "not a url",
    "ftp://127.0.0.1:1234",
    "http://user:secret@127.0.0.1:1234",
    "//127.0.0.1:1234",
    "http://",
  ]) {
    assert.equal(
      resolveServiceBaseUrl({ ...OPTIONS, env: { NODE_ENV: "test", SOME_BASE_URL: value } }),
      "https://real.example",
      `override ${value} must be ignored`
    );
  }
});

test("both providers keep their real address outside development and test", () => {
  const env = { NODE_ENV: "production", PINTEREST_API_BASE_URL: "http://127.0.0.1:1", AI_PROVIDER_BASE_URL: "http://127.0.0.1:2" };
  assert.equal(resolvePinterestApiBase(env), PINTEREST_DEFAULT);
  assert.equal(resolveApiBase(env), AI_DEFAULT);
  assert.match(PINTEREST_DEFAULT, /^https:\/\/api\.pinterest\.com\//);
});

test("the Pinterest seam is narrow: it only redirects in test or development", () => {
  assert.equal(
    resolvePinterestApiBase({ NODE_ENV: "test", PINTEREST_API_BASE_URL: "http://127.0.0.1:9/v5" }),
    "http://127.0.0.1:9/v5"
  );
  assert.equal(resolvePinterestApiBase({ NODE_ENV: "staging", PINTEREST_API_BASE_URL: "http://127.0.0.1:9/v5" }), PINTEREST_DEFAULT);
});
