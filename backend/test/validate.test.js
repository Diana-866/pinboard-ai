"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * validate.js runs on essentially every route, and three of its seven functions had no test at
 * all: validateUrl, the validateEnum error branch and validateLen. Untested validators are
 * where a silent inconsistency hides, because a wrong answer looks like a valid input.
 *
 * Writing these tests found one real defect: validateInt accepted "" (and " ", and null) as the
 * number 0, because Number("") is 0. Every current caller uses min >= 1 so nothing broke yet, but
 * an empty query parameter would have become a valid zero the moment a caller allowed it. Missing
 * is now missing - it takes the default or it is an error - and booleans/arrays/objects, which
 * also coerce to numbers, are refused.
 */

const {
  httpError,
  validateEmail,
  validatePassword,
  optionalString,
  validateUrl,
  validateEnum,
  validateInt,
  validateLen,
} = require("../validate");

test("httpError carries a status and a message", () => {
  const error = httpError(418, "teapot");
  assert.equal(error.httpStatus, 418);
  assert.equal(error.message, "teapot");
  assert.ok(error instanceof Error);
});

test("email is trimmed, lowercased and bounded", () => {
  assert.equal(validateEmail("  Someone@Example.COM "), "someone@example.com");
  // Plus-addressing and subdomains are legitimate addresses.
  assert.equal(validateEmail("a+tag@mail.example.co.uk"), "a+tag@mail.example.co.uk");

  for (const bad of [undefined, null, 42, {}, [], true]) {
    assert.throws(() => validateEmail(bad), (error) => error.httpStatus === 422, `email ${String(bad)} must be refused`);
  }
  for (const bad of ["a@b.c", "no-at-sign", "a b@example.com", "a@@example.com", `${"x".repeat(250)}@example.com`, "a@b..c"]) {
    assert.throws(() => validateEmail(bad), (error) => error.httpStatus === 422, `email ${bad} must be refused`);
  }
});

test("the password is bounded but never altered", () => {
  // Trimming or normalizing a password would silently change what the customer typed and
  // break their next login on another device.
  const spaced = "  spaced pass  ";
  assert.equal(validatePassword(spaced), spaced);

  for (const bad of [undefined, null, 42, "short", "x".repeat(129)]) {
    assert.throws(() => validatePassword(bad), (error) => error.httpStatus === 422);
  }
  assert.equal(validatePassword("12345678").length, 8);
  assert.equal(validatePassword("x".repeat(128)).length, 128);
});

test("optional strings collapse empty input to null and are capped", () => {
  assert.equal(optionalString(undefined), null);
  assert.equal(optionalString(null), null);
  assert.equal(optionalString(""), null);
  assert.equal(optionalString("   "), null);
  assert.equal(optionalString("  hi  "), "hi");
  assert.equal(optionalString("abcdef", { max: 3 }), "abc");
  assert.throws(() => optionalString(42), (error) => error.httpStatus === 422);
});

test("a website URL must be http or https and is normalized", () => {
  assert.equal(validateUrl("HTTPS://Example.COM/Path?b=1"), "https://example.com/Path?b=1");
  assert.equal(validateUrl("  http://example.com  "), "http://example.com/");
  assert.equal(validateUrl("https://example.com"), "https://example.com/");

  // Non-web schemes would be stored as a "website" and later opened or fetched by the server.
  for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "ftp://example.com", "file:///etc/passwd"]) {
    assert.throws(
      () => validateUrl(bad),
      (error) => error.httpStatus === 422 && /http/.test(error.message),
      `${bad} must be refused`
    );
  }
  for (const bad of ["", "   ", "example.com", "http://", "https://exa mple.com"]) {
    assert.throws(() => validateUrl(bad), (error) => error.httpStatus === 422, `url ${JSON.stringify(bad)} must be refused`);
  }
  for (const bad of [undefined, null, 42, {}]) {
    assert.throws(() => validateUrl(bad), (error) => error.httpStatus === 422);
  }

  // The field name reaches the customer, so it must be carried through.
  assert.throws(() => validateUrl("", { name: "Ссылка проекта" }), /Ссылка проекта/);
});

test("enums take the default only when the value is absent", () => {
  const allowed = ["light", "dark"];
  assert.equal(validateEnum(undefined, allowed, "light"), "light");
  assert.equal(validateEnum(null, allowed, "light"), "light");
  assert.equal(validateEnum("", allowed, "light"), "light");
  assert.equal(validateEnum("dark", allowed, "light"), "dark");

  // Without a default, an absent value is an error rather than a silent pass.
  assert.throws(() => validateEnum(undefined, allowed), (error) => error.httpStatus === 422);
  assert.throws(() => validateEnum("", allowed), (error) => error.httpStatus === 422);
  // The refusal lists what is allowed, so a client developer can fix the call.
  assert.throws(() => validateEnum("sepia", allowed, "light", "Тема"), /light, dark/);
  assert.throws(() => validateEnum("sepia", allowed, "light", "Тема"), /Тема/);
});

test("integers are bounded, and an absent value is not a zero", () => {
  assert.equal(validateInt("7", { min: 1, max: 10 }), 7);
  assert.equal(validateInt(7, { min: 1, max: 10 }), 7);
  assert.equal(validateInt(" 7 ", { min: 1, max: 10 }), 7);
  assert.equal(validateInt(undefined, { min: 1, max: 10, def: 6 }), 6);
  assert.equal(validateInt("", { min: 1, max: 10, def: 6 }), 6);

  // Number("") / Number(null) / Number(true) / Number([]) all coerce to 0 or 1. None of them
  // means the integer the caller asked for.
  for (const missing of ["", "   ", null, true, false, [], ["5"], {}]) {
    assert.throws(
      () => validateInt(missing, { min: 0, max: 10 }),
      (error) => error.httpStatus === 422,
      `${JSON.stringify(missing)} must not become a number`
    );
  }
  for (const bad of [undefined, "abc", 1.5, "1.5", NaN, Infinity, -1, 11]) {
    assert.throws(() => validateInt(bad, { min: 0, max: 10 }), (error) => error.httpStatus === 422, `${String(bad)} must be refused`);
  }
  assert.throws(() => validateInt(11, { min: 0, max: 10, name: "Количество" }), /Количество/);
});

test("length-limited text collapses empty input and is capped", () => {
  assert.equal(validateLen(undefined, 80, "Имя"), null);
  assert.equal(validateLen(null, 80, "Имя"), null);
  assert.equal(validateLen("", 80, "Имя"), null);
  assert.equal(validateLen("   ", 80, "Имя"), null);
  assert.equal(validateLen("  Ann  ", 80, "Имя"), "Ann");
  assert.equal(validateLen("Ann", 2, "Имя"), "An");
  assert.throws(() => validateLen(42, 80, "Имя"), (error) => error.httpStatus === 422 && /Имя/.test(error.message));
});
