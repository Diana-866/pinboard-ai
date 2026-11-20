"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { GENERATION_NOT_CHARGED, markGenerationFailure } = require("../generationFailure");

/**
 * Section 115. When generation fails before the first billable image request, the database returns
 * the credit reservation (its trigger releases it the moment the request turns `failed`, and even an
 * `unknown` request with no persisted image task releases it). The customer only saw "внутренняя
 * ошибка сервера, попробуйте позже" and could not tell a free failure from a charged one.
 */

test("a failure that never reached the image provider says nothing was charged", () => {
  const error = Object.assign(new Error("Нейросеть вернула некорректный результат"), { httpStatus: 502 });
  const marked = markGenerationFailure(error, { providerStarted: false });
  assert.equal(marked, error, "the same error object is returned, so the status and message survive");
  assert.equal(marked.details.code, GENERATION_NOT_CHARGED);
});

test("a failure after the provider was asked is fenced, not promised away", () => {
  // The request is marked `unknown` in that case and the reservation is kept until reconciliation,
  // so "nothing was charged" would be a lie the customer would act on.
  const error = Object.assign(new Error("provider failed"), { httpStatus: 502 });
  const marked = markGenerationFailure(error, { providerStarted: true });
  assert.equal(marked, error);
  assert.equal(marked.details.code, "generation_outcome_unknown");
});

test("a specific code already on the failure is never overwritten", () => {
  // 402 says "insufficient credits", which is more useful than "nothing was charged".
  const error = Object.assign(new Error("Баланс изменился во время генерации"), {
    httpStatus: 402,
    details: { code: "insufficient_credits" },
  });
  const marked = markGenerationFailure(error, { providerStarted: false });
  assert.equal(marked.details.code, "insufficient_credits");

  // And an empty or non-string code does not count as a specific one.
  for (const details of [{ code: "" }, { code: "   " }, { code: 42 }, {}]) {
    const other = Object.assign(new Error("x"), { httpStatus: 502, details: { ...details } });
    markGenerationFailure(other, { providerStarted: false });
    assert.equal(other.details.code, GENERATION_NOT_CHARGED, JSON.stringify(details));
  }
});

test("a thrown value that cannot carry details is returned untouched", () => {
  for (const value of [null, undefined, "boom", 42]) {
    assert.equal(markGenerationFailure(value, { providerStarted: false }), value);
  }
});

test("the generation route uses the marker, and only with the real provider state", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8").replace(/\r\n/g, "\n");
  assert.match(
    source,
    /handleError\(res, markGenerationFailure\(e, \{ providerStarted: providerGenerationStarted \}\), publicMessage\)/,
    "the route must mark the failure with the provider state it tracked"
  );
  // The provider state is the flag the fail_pin_generation_request call already uses: if that ever
  // stops being tracked, this marker would silently claim "nothing was charged" for a charged run.
  assert.ok(
    (source.match(/providerGenerationStarted/g) || []).length >= 5,
    "the provider state must still be tracked on every path"
  );
});
