const test = require("node:test");
const assert = require("node:assert/strict");
const { validateAnalysisResult, validateBoardIdeas, parseAnalysisResponse, parseBoardIdeasResponse } = require("../textOutputValidation");

test("accepts valid analysis and trims surrounding whitespace", () => {
  assert.deepEqual(validateAnalysisResult({ niche: "  Travel  ", summary: "  Useful summary.  " }), {
    niche: "Travel", summary: "Useful summary.",
  });
});

test("rejects missing, wrong-type, empty, and oversized analysis fields", () => {
  for (const value of [null, [], {}, { niche: "Travel", summary: "" },
    { niche: 7, summary: "summary" }, { niche: "x".repeat(81), summary: "summary" },
    { niche: "Travel", summary: "x".repeat(1201) }]) {
    assert.throws(() => validateAnalysisResult(value), (error) => error.httpStatus === 502);
  }
});

test("accepts one to five board ideas and returns only the public schema", () => {
  const ideas = validateBoardIdeas([
    { title: "  Travel tips ", description: " Helpful ideas ", extra: "discard" },
    { title: "Food", description: "Recipes" },
  ]);
  assert.deepEqual(ideas, [
    { title: "Travel tips", description: "Helpful ideas" },
    { title: "Food", description: "Recipes" },
  ]);
});

test("rejects empty, oversized, and non-array board results", () => {
  for (const value of [null, {}, [], Array(6).fill({ title: "x", description: "y" })]) {
    assert.throws(() => validateBoardIdeas(value), (error) => error.httpStatus === 502);
  }
});

test("rejects malformed board entries and invalid text lengths", () => {
  for (const value of [
    [null], ["not an object"], [{}],
    [{ title: "", description: "valid" }],
    [{ title: "x".repeat(41), description: "valid" }],
    [{ title: "valid", description: "x".repeat(501) }],
    [{ title: "valid", description: 123 }],
  ]) {
    assert.throws(() => validateBoardIdeas(value), (error) => error.httpStatus === 502);
  }
});


test("parses valid analysis JSON, including a surrounding prose wrapper", () => {
  assert.deepEqual(parseAnalysisResponse('Result: {"niche":"Travel","summary":"A travel site."}'), {
    niche: "Travel", summary: "A travel site.",
  });
});

test("rejects malformed, empty, and invalid analysis provider responses with HTTP 502", () => {
  for (const raw of ["", "not JSON", '{"niche":"Travel","summary":""}', null]) {
    assert.throws(() => parseAnalysisResponse(raw), (error) => error.httpStatus === 502);
  }
});

test("parses valid board JSON and strips unsupported fields", () => {
  assert.deepEqual(parseBoardIdeasResponse('[{"title":"Travel","description":"Guides","ignored":true}]'), [
    { title: "Travel", description: "Guides" },
  ]);
});

test("rejects malformed, empty, and invalid board provider responses with HTTP 502", () => {
  for (const raw of ["", "not JSON", "[]", '[{"title":"", "description":"text"}]', null]) {
    assert.throws(() => parseBoardIdeasResponse(raw), (error) => error.httpStatus === 502);
  }
});
