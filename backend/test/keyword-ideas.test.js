require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseKeywordIdeasResponse,
  validateKeywordIdeas,
  buildKeywordPrompt,
  KEYWORD_LIMITS,
} = require("../keywordIdeas");

const VALID = [
  { keyword: "minimalist living room", intent: "inspiration", why: "ищут идеи оформления" },
  { keyword: "small apartment storage ideas", intent: "how_to", why: "проблема нехватки места" },
];

test("accepts a clean JSON array", () => {
  const ideas = parseKeywordIdeasResponse(JSON.stringify(VALID), 12);
  assert.equal(ideas.length, 2);
  assert.deepEqual(ideas[0], { keyword: "minimalist living room", intent: "inspiration", why: "ищут идеи оформления" });
});

test("extracts the array from prose or a code fence", () => {
  const wrapped = "Вот подборка:\n```json\n" + JSON.stringify(VALID) + "\n```\nГотово.";
  assert.equal(parseKeywordIdeasResponse(wrapped, 12).length, 2);
});

test("trims, collapses whitespace and removes duplicates case-insensitively", () => {
  const ideas = validateKeywordIdeas([
    { keyword: "  Scandinavian   bedroom ", intent: "style", why: "стиль" },
    { keyword: "scandinavian bedroom", intent: "style", why: "дубль" },
    { keyword: "cozy reading corner", intent: "inspiration", why: "идеи" },
  ], 5);
  assert.deepEqual(ideas.map((item) => item.keyword), ["Scandinavian bedroom", "cozy reading corner"]);
});

test("an unknown intent falls back instead of failing the batch", () => {
  assert.equal(validateKeywordIdeas([{ keyword: "a b", intent: "buy", why: "x" }], 5)[0].intent, "inspiration");
});

test("honours the requested count and the hard limit", () => {
  const many = Array.from({ length: 40 }, (_, index) => ({
    keyword: `keyword number ${index}`, intent: "inspiration", why: "why",
  }));
  assert.equal(validateKeywordIdeas(many, 3).length, 3);
  assert.equal(validateKeywordIdeas(many, 999).length, KEYWORD_LIMITS.count);
});

test("rejects responses that cannot become UI rows", () => {
  assert.throws(() => parseKeywordIdeasResponse("", 5), /пустой ответ/);
  assert.throws(() => parseKeywordIdeasResponse("not json", 5), /Не удалось разобрать/);
  assert.throws(() => parseKeywordIdeasResponse("[]", 5), /ни одной идеи/);
  assert.throws(() => validateKeywordIdeas([{ keyword: "", intent: "style", why: "x" }], 5), /keyword/);
  assert.throws(() => validateKeywordIdeas([{ keyword: "a b", intent: "style" }], 5), /why/);
  assert.throws(() => validateKeywordIdeas([null], 5), /Некорректная идея/);
});

test("the prompt forbids invented metrics", () => {
  const prompt = buildKeywordPrompt({ topic: "декор", niche: "интерьер", language: "ru", count: 8 });
  assert.match(prompt, /Не придумывай числа/);
  assert.match(prompt, /8 поисковых фраз/);
  assert.doesNotMatch(prompt, /объём поиска: \d/);
});

test("the keyword route is registered behind authentication", async () => {
  // Contract check: the route must exist and must not be reachable anonymously.
  const { readFileSync } = require("node:fs");
  const index = readFileSync(require("node:path").join(__dirname, "..", "index.js"), "utf8");
  const at = index.indexOf('app.post("/keywords"');
  assert.notEqual(at, -1, "POST /keywords must be registered");
  assert.match(index.slice(at, at + 120), /requireAuth/);
});
