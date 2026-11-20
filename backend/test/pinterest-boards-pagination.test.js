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

test("a 200 without a board list is refused instead of reading as an empty account", async () => {
  // Section 105: the route mapped a malformed page to `{ boards: [] }`, so a changed Pinterest
  // response shape reached the customer as "you have no boards" - a fail-open parsing error.
  for (const data of [{}, { items: null }, { items: "none" }, null]) {
    const result = await fetchAllPinterestBoards(async () => ({ ok: true, status: 200, data }));
    assert.equal(result.ok, false, `a page ${JSON.stringify(data)} must not read as an empty board list`);
    assert.equal(result.status, 502);
    assert.match(result.data.message, /без списка/);
    assert.equal(result.data.items, undefined, "a refused page must not carry a partial board list");
  }
});

test("a board without a usable id is refused instead of becoming a 500 in the route", async () => {
  for (const items of [[null], [{ name: "no id" }], [{ id: "" }], [{ id: "   " }], [{ id: Number.NaN }], [42]]) {
    const result = await fetchAllPinterestBoards(async () => ({ ok: true, status: 200, data: { items } }));
    assert.equal(result.ok, false, `items ${JSON.stringify(items)} must be refused`);
    assert.equal(result.status, 502);
    assert.match(result.data.message, /без идентификатора/);
    assert.equal(result.data.page, 1);
  }
});

test("an account with no boards at all is still a valid empty list, not an error", async () => {
  // The refusal above must not turn a real empty account into a failure: Pinterest answers with an
  // empty array, which is data, not a broken page.
  const result = await fetchAllPinterestBoards(async () => ({ ok: true, status: 200, data: { items: [] } }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items, []);
});

test("a numeric board id stays usable, because Pinterest is free to send one", async () => {
  const result = await fetchAllPinterestBoards(async () => ({
    ok: true,
    status: 200,
    data: { items: [{ id: 12345, name: "Numeric" }] },
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items.map((item) => item.id), [12345]);
});
