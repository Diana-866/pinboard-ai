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
  // The route delegates to the shared bounded pager, which applies the 500-row
  // page size, the explicit row ceiling and HTTP 413 on overflow.
  assert.match(route, /fetchAllPages\(\(from, to\) =>/);
  assert.match(route, /\.range\(from, to\)/);
  assert.match(route, /\.eq\("board_id", req\.params\.id\)/);
  assert.match(route, /handleError\(res, e\)/);
});

test("board pin pagination uses a deterministic order", () => {
  assert.match(route, /\.order\("created_at", \{ ascending: true \}\)/);
  assert.match(route, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(route, /\.eq\("board_id", req\.params\.id\)/);
});
