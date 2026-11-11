const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
const start = source.indexOf('app.get("/boards/:id/pins"');
const end = source.indexOf('// Read-only recovery endpoint', start);
const route = source.slice(start, end);

test("board pin listing paginates beyond the database API row cap", () => {
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(route, /const pageSize = 500/);
  assert.match(route, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(route, /if \(page\.length < pageSize\) break/);
  assert.match(route, /pins\.push\(\.\.\.page\)/);
});

test("board pin pagination uses a deterministic order", () => {
  assert.match(route, /\.order\("created_at", \{ ascending: true \}\)/);
  assert.match(route, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(route, /\.eq\("board_id", req\.params\.id\)/);
});
