"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchAllPages } = require("../fetchAllPages");

test("fetchAllPages reads every page and preserves order", async () => {
  const rows = Array.from({ length: 7 }, (_, id) => ({ id }));
  const ranges = [];
  const result = await fetchAllPages(async (from, to) => {
    ranges.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  }, { pageSize: 3, maxRows: 10 });
  assert.deepEqual(result, rows);
  assert.deepEqual(ranges, [[0, 2], [3, 5], [6, 8]]);
});

test("fetchAllPages distinguishes an exact cap from overflow", async () => {
  const exact = await fetchAllPages(async (from, to) => ({
    data: [0, 1, 2, 3, 4].slice(from, to + 1),
    error: null,
  }), { pageSize: 2, maxRows: 5 });
  assert.equal(exact.length, 5);

  await assert.rejects(
    fetchAllPages(async (from, to) => ({
      data: [0, 1, 2, 3, 4, 5].slice(from, to + 1),
      error: null,
    }), { pageSize: 2, maxRows: 5 }),
    (error) => error && error.httpStatus === 413
  );
});

test("fetchAllPages propagates database errors and rejects invalid settings", async () => {
  const dbError = new Error("database unavailable");
  await assert.rejects(fetchAllPages(async () => ({ data: null, error: dbError })), dbError);
  await assert.rejects(fetchAllPages(async () => ({ data: [], error: null }), { pageSize: 0 }), /pageSize/);
  await assert.rejects(fetchAllPages(async () => ({ data: [], error: null }), { maxRows: 0 }), /maxRows/);
});
