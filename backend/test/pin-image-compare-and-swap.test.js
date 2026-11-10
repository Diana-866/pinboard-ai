const test = require("node:test");
const assert = require("node:assert/strict");
const { applyPinImageCompareAndSwapFilter } = require("../pinImageCompareAndSwap");

function queryRecorder() {
  const calls = [];
  return {
    calls,
    eq(...args) { calls.push(["eq", ...args]); return this; },
    is(...args) { calls.push(["is", ...args]); return this; },
  };
}

test("image replacement compares against the previously observed URL", () => {
  const query = queryRecorder();
  assert.equal(applyPinImageCompareAndSwapFilter(query, "https://cdn.example/old.webp"), query);
  assert.deepEqual(query.calls, [["eq", "image_url", "https://cdn.example/old.webp"]]);
});

test("image replacement uses IS NULL for pins without an existing image", () => {
  const query = queryRecorder();
  applyPinImageCompareAndSwapFilter(query, null);
  assert.deepEqual(query.calls, [["is", "image_url", null]]);
});
