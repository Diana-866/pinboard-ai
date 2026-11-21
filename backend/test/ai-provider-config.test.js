"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { providerRequestConfig } = require("../gptunnel");

/**
 * Section 159. `GPTUNNEL_API_KEY=<gptunnel-key>` was sent as the Authorization header verbatim.
 * The provider answered 401, axios threw, and the customer saw an unexplained failure on the most
 * expensive action in the product — while the real cause was a value nobody had replaced.
 */
test("a placeholder key is refused before any provider call, with an actionable code", () => {
  for (const value of ["<gptunnel-key>", "", "changeme", "your-key", undefined]) {
    assert.throws(
      () => providerRequestConfig({ GPTUNNEL_API_KEY: value }),
      (error) => {
        assert.equal(error.httpStatus, 503);
        assert.equal(error.details.code, "ai_provider_not_configured");
        return true;
      },
      `${JSON.stringify(value)} must be refused`
    );
  }
});

test("a real key still produces the authorization header", () => {
  const config = providerRequestConfig({ GPTUNNEL_API_KEY: "gpt_8f3a9c2b7d1e" });
  assert.equal(config.headers.Authorization, "gpt_8f3a9c2b7d1e");
  assert.equal(Number.isInteger(config.timeout), true);
});

test("the refusal names nobody's secret", () => {
  try {
    providerRequestConfig({ GPTUNNEL_API_KEY: "<gptunnel-key>" });
  } catch (error) {
    assert.equal(String(error.message).includes("<gptunnel-key>"), false);
  }
});

test("startup warns about a placeholder provider key too", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(indexSource, /ai\.provider_placeholder/);
  assert.match(indexSource, /looksLikePlaceholder\(process\.env\.GPTUNNEL_API_KEY\)/);
  // Проверки должны стоять ДО попытки занять порт: иначе при занятом порту они не печатаются.
  assert.ok(
    indexSource.indexOf("ai.provider_placeholder") < indexSource.indexOf("app.listen("),
    "configuration warnings must not be gated on a successful listen"
  );
  assert.ok(indexSource.indexOf("mail.config_placeholder") < indexSource.indexOf("app.listen("));
});
