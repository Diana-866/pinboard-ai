const test = require("node:test");
const assert = require("node:assert/strict");
const { buildBoardPatch } = require("../boardPatch");

test("buildBoardPatch trims and limits a supplied title", () => {
  assert.deepEqual(buildBoardPatch({ title: "  Travel ideas  " }), { title: "Travel ideas" });
  assert.equal(buildBoardPatch({ title: "x".repeat(120) }).title.length, 100);
});

test("buildBoardPatch preserves omitted fields", () => {
  assert.deepEqual(buildBoardPatch({ title: "Updated" }), { title: "Updated" });
  assert.deepEqual(buildBoardPatch({ description: "Updated" }), { description: "Updated" });
  assert.deepEqual(buildBoardPatch({ category: "Travel" }), { category: "Travel" });
});

test("buildBoardPatch allows clearing descriptions and categories", () => {
  assert.deepEqual(buildBoardPatch({ description: "" }), { description: "" });
  assert.deepEqual(buildBoardPatch({ description: null }), { description: "" });
  assert.deepEqual(buildBoardPatch({ category: "" }), { category: null });
  assert.deepEqual(buildBoardPatch({ category: null }), { category: null });
});

test("buildBoardPatch rejects empty titles and empty patches", () => {
  assert.throws(() => buildBoardPatch({ title: "" }), { httpStatus: 422 });
  assert.throws(() => buildBoardPatch({ title: "   " }), { httpStatus: 422 });
  assert.throws(() => buildBoardPatch({}), { httpStatus: 422 });
  assert.throws(() => buildBoardPatch({ unknown: "ignored" }), { httpStatus: 422 });
  assert.throws(() => buildBoardPatch({ title: "Updated", descripton: "typo" }), {
    httpStatus: 422,
    message: "Неизвестные поля обновления доски",
  });
});

test("buildBoardPatch rejects non-string descriptions and categories", () => {
  assert.throws(() => buildBoardPatch({ description: 42 }), { httpStatus: 422 });
  assert.throws(() => buildBoardPatch({ category: 42 }), { httpStatus: 422 });
  assert.equal(buildBoardPatch({ category: "x".repeat(150) }).category.length, 120);
});
