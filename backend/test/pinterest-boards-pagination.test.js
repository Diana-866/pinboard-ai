const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchAllPinterestBoards, MAX_PINTEREST_BOARD_PAGES } = require("../pinterestBoardsPagination");

test("loads every page and returns one complete board list", async () => {
  const calls = [];
  const pages = new Map([
    [null, { ok: true, status: 200, data: { items: [{ id: "a" }], bookmark: "cursor-1" } }],
    ["cursor-1", { ok: true, status: 200, data: { items: [{ id: "b" }], bookmark: "cursor-2" } }],
    ["cursor-2", { ok: true, status: 200, data: { items: [{ id: "c" }] } }],
  ]);
  const result = await fetchAllPinterestBoards(async (bookmark) => {
    calls.push(bookmark);
    return pages.get(bookmark);
  });
  assert.deepEqual(calls, [null, "cursor-1", "cursor-2"]);
  assert.deepEqual(result.data.items.map((item) => item.id), ["a", "b", "c"]);
});

test("fails instead of repeatedly fetching a Pinterest cursor", async () => {
  const calls = [];
  const result = await fetchAllPinterestBoards(async (bookmark) => {
    calls.push(bookmark);
    return { ok: true, status: 200, data: { items: [{ id: "same" }], bookmark: "stuck" } };
  });
  assert.equal(result.ok, false);
  assert.match(result.data.message, /повторяющийся курсор/);
  assert.deepEqual(calls, [null, "stuck"]);
});

test("fails explicitly when board count exceeds the supported page bound", async () => {
  let calls = 0;
  const result = await fetchAllPinterestBoards(async () => {
    calls += 1;
    return { ok: true, status: 200, data: { items: [{ id: String(calls) }], bookmark: `cursor-${calls}` } };
  });
  assert.equal(calls, MAX_PINTEREST_BOARD_PAGES);
  assert.equal(result.ok, false);
  assert.equal(result.data.pagesFetched, MAX_PINTEREST_BOARD_PAGES);
  assert.match(result.data.message, /список не был обрезан молча/);
});

test("preserves provider errors without returning a partial board list", async () => {
  const providerError = { ok: false, status: 429, data: { message: "rate limited" } };
  const result = await fetchAllPinterestBoards(async () => providerError);
  assert.equal(result, providerError);
});
