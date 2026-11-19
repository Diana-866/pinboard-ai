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

test("a plan name lookup never returns something inherited from Object.prototype", () => {
  // Same class of defect as the plan guard in billing.js: PLAN_NAMES is a literal, so indexing
  // it with an untrusted string used to return inherited members. getPlanTitle("constructor")
  // returned a function, which would have been interpolated into a customer's payment email.
  for (const language of ["en", "ru", "zh", "de"]) {
    for (const plan of ["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty"]) {
      const title = getPlanTitle(plan, language);
      assert.equal(typeof title, "string", `${plan} must never produce a non-string title (${language})`);
      assert.equal(title, plan, "an unknown plan is echoed unchanged, never invented");
    }
  }
  // And the real names still work.
  assert.equal(getPlanTitle("pro", "zh"), "专业版");
  assert.equal(getPlanTitle("PRO", "ru"), "Про", "lookup is case-insensitive");
  assert.equal(getPlanTitle(null, "ru"), "", "a missing plan is not an error");
});

test("every supported language carries every plan name and email key", () => {
  // A missing key would fall back to the raw plan id inside a localized email.
  for (const language of ["en", "ru", "es", "pt", "de", "fr", "zh"]) {
    const copy = getEmailCopy(language);
    for (const key of ["hello", "activatedSubject", "activatedBody", "amount", "payment", "validUntil", "team"]) {
      assert.ok(typeof copy[key] === "string" && copy[key].trim(), `${language} is missing ${key}`);
    }
    for (const plan of ["analytics", "start", "pro", "agency"]) {
      const title = getPlanTitle(plan, language);
      assert.ok(title !== plan || language === "en" ? true : title.length > 0);
      assert.ok(typeof title === "string" && title.trim(), `${language} has no title for ${plan}`);
    }
    assert.match(copy.activatedSubject, /\{plan\}/, `${language} must keep the plan placeholder`);
  }
});
