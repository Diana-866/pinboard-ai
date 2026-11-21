"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const auth = require("../auth");

/**
 * Section 164. The consent checkbox lived only in the browser: `POST /register` accepted a request
 * without it, and no column recorded that a person had agreed to the terms. Consent is a legal fact —
 * it must be required by the server and stored, not held in React state.
 */
test("registration refuses a request that does not carry consent", async () => {
  for (const value of [undefined, false, "true", 1, null]) {
    await assert.rejects(
      () => auth.register("consent-check@example.com", "long-enough-password", "", "", "ru", value),
      (error) => {
        assert.equal(error.httpStatus, 422);
        assert.equal(error.details.code, "terms_not_accepted");
        return true;
      },
      `${JSON.stringify(value)} must be refused`
    );
  }
});

test("the consent check runs before the database is touched", async () => {
  // Никакого запроса к Supabase: отказ обязан приходить из проверки, а не из ответа базы.
  const source = fs.readFileSync(path.join(__dirname, "..", "auth.js"), "utf8");
  const consentIndex = source.indexOf("terms_not_accepted");
  const lookupIndex = source.indexOf('.from("users")');
  assert.ok(consentIndex > 0 && lookupIndex > 0);
  assert.ok(consentIndex < lookupIndex, "consent must be checked before the email lookup");
});

test("consent is written with the registration timestamp", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "auth.js"), "utf8");
  assert.match(source, /terms_accepted_at: new Date\(\)\.toISOString\(\)/);
});

test("a missing column degrades instead of breaking registration", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "auth.js"), "utf8");
  assert.match(source, /preferred_language\|terms_accepted_at\)/, "the optional-column retry must cover the new column");
  assert.match(source, /auth\.consent_not_persisted/);
});

test("the browser sends the consent it collected", async () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "..", "frontend", "src", "pages", "Register.tsx"), "utf8");
  assert.match(page, /terms_accepted: agree === true/);
});

test("the migration exists and is idempotent", async () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "..", "db", "migrations", "166_user_terms_consent.sql"), "utf8");
  assert.match(sql, /add column if not exists terms_accepted_at timestamptz/);
});
