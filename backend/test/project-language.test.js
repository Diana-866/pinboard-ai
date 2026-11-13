const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveProjectLanguage } = require("../projectLanguage");

test("preserves each supported registration language for the first project", () => {
  for (const language of ["en", "ru", "es", "pt", "de", "fr", "zh"]) {
    assert.equal(resolveProjectLanguage(language), language);
  }
});

test("falls back safely for missing, malformed, or unsupported language values", () => {
  for (const value of [undefined, null, "", "EN", "it", 42, {}, []]) {
    assert.equal(resolveProjectLanguage(value), "ru");
  }
});
