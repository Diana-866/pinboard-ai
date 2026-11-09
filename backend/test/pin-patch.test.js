const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPinPatch } = require("../pinPatch");

const ratios = ["2:3", "1:1", "9:16"];

test("buildPinPatch trims and limits titles", () => {
  assert.deepEqual(buildPinPatch({ title: "  Summer  " }, ratios), { title: "Summer" });
  assert.equal(buildPinPatch({ title: "x".repeat(120) }, ratios).title.length, 100);
});

test("buildPinPatch can clear descriptions without changing omitted fields", () => {
  assert.deepEqual(buildPinPatch({ description: "" }, ratios), { description: "" });
  assert.deepEqual(buildPinPatch({ description: "   " }, ratios), { description: "" });
  assert.deepEqual(buildPinPatch({ description: null }, ratios), { description: "" });
  assert.deepEqual(buildPinPatch({ title: "Updated" }, ratios), { title: "Updated" });
});

test("buildPinPatch validates aspect ratios", () => {
  assert.deepEqual(buildPinPatch({ aspect_ratio: "2:3" }, ratios), { aspect_ratio: "2:3" });
  assert.throws(() => buildPinPatch({ aspect_ratio: "wide" }, ratios), { httpStatus: 422 });
  assert.throws(() => buildPinPatch({ aspect_ratio: "" }, ratios), { httpStatus: 422 });
});

test("buildPinPatch rejects empty titles, empty patches and unknown-only patches", () => {
  assert.throws(() => buildPinPatch({ title: "" }, ratios), { httpStatus: 422 });
  assert.throws(() => buildPinPatch({ title: "  " }, ratios), { httpStatus: 422 });
  assert.throws(() => buildPinPatch({}, ratios), { httpStatus: 422 });
  assert.throws(() => buildPinPatch({ ignored: true }, ratios), { httpStatus: 422 });
  assert.throws(() => buildPinPatch({ title: "Updated", descripton: "typo" }, ratios), {
    httpStatus: 422,
    message: "Неизвестные поля обновления пина",
  });
});

test("buildPinPatch rejects non-string descriptions", () => {
  assert.throws(() => buildPinPatch({ description: 42 }, ratios), { httpStatus: 422 });
});
