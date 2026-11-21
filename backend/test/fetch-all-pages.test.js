"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchAllPages, readArrayQueryResult } = require("../fetchAllPages");

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

test("fetchAllPages fails closed on a malformed page instead of truncating the list", async () => {
  // A successful response without an array payload must never be read as an
  // empty (complete) page: that would silently return a partial collection.
  for (const malformed of [null, undefined, {}, "rows", 42]) {
    await assert.rejects(
      fetchAllPages(async () => ({ data: malformed, error: null })),
      (error) => error && error.httpStatus === 502,
      `malformed page payload: ${JSON.stringify(malformed)}`
    );
  }

  // The same rule applies to the dedicated overflow probe after an exact cap.
  let calls = 0;
  await assert.rejects(
    fetchAllPages(async (from, to) => {
      calls += 1;
      if (calls === 1) return { data: [0, 1], error: null };
      return { data: null, error: null };
    }, { pageSize: 2, maxRows: 2 }),
    (error) => error && error.httpStatus === 502
  );
});

test("readArrayQueryResult rejects malformed envelopes and preserves valid empty results", () => {
  const dbError = new Error("database unavailable");
  assert.throws(() => readArrayQueryResult({ data: null, error: dbError }), (error) => error === dbError);

  for (const malformed of [null, undefined, {}, [], "rows", { data: null, error: null }, { data: {}, error: null }]) {
    assert.throws(
      () => readArrayQueryResult(malformed),
      (error) => error && error.httpStatus === 502,
      "malformed query result must fail closed"
    );
  }

  assert.deepEqual(readArrayQueryResult({ data: [], error: null }), []);
});
