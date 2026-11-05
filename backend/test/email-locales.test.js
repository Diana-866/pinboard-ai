const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeLanguage, getEmailCopy, getPlanTitle, getLocale } = require("../email-locales");

test("supports every UI locale and falls back to English", () => {
  for (const language of ["en", "ru", "es", "pt", "de", "fr", "zh"]) {
    assert.equal(normalizeLanguage(language), language);
    assert.ok(getEmailCopy(language).verifySubject);
    assert.ok(getEmailCopy(language).resetSubject);
    assert.ok(getEmailCopy(language).activatedSubject.includes("{plan}"));
    assert.ok(getEmailCopy(language).activatedBody.includes("{plan}"));
    assert.ok(getEmailCopy(language).activatedBody.includes("{currentPlan}"));
    assert.ok(getEmailCopy(language).validUntil);
    assert.ok(getLocale(language));
  }
  assert.equal(normalizeLanguage("it-IT"), "en");
  assert.equal(normalizeLanguage(undefined), "en");
});

test("returns localized plan names", () => {
  assert.equal(getPlanTitle("pro", "ru"), "Про");
  assert.equal(getPlanTitle("pro", "en"), "Pro");
  assert.equal(getPlanTitle("agency", "zh"), "代理版");
});
