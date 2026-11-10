const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { optionalString } = require("../validate");

test("optional registration profile fields accept missing and bounded strings", () => {
  assert.equal(optionalString(undefined, { max: 80 }), null);
  assert.equal(optionalString(null, { max: 80 }), null);
  assert.equal(optionalString("  Diana  ", { max: 80 }), "Diana");
  assert.equal(optionalString("x".repeat(100), { max: 80 }), "x".repeat(80));
});

test("optional registration profile fields reject non-string JSON values", () => {
  for (const value of [42, {}, [], true]) {
    assert.throws(
      () => optionalString(value, { max: 80 }),
      (error) => error.httpStatus === 422
    );
  }
});

test("registration route validates name, surname and language before calling auth service", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(source, /const name = optionalString\(req\.body && req\.body\.name, \{ max: 80 \}\)/);
  assert.match(source, /const surname = optionalString\(req\.body && req\.body\.surname, \{ max: 80 \}\)/);
  assert.match(source, /const preferredLanguage = optionalString\(req\.body && req\.body\.preferred_language, \{ max: 16 \}\)/);
  assert.match(source, /register\(email, password, name, surname, preferredLanguage\)/);
});
