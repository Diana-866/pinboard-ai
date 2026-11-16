"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("GET /boards/:id/pins uses the shared bounded pager after owner check", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const start = source.indexOf('app.get("/boards/:id/pins"');
  const end = source.indexOf('app.get("/generation/requests/:key"', start);
  assert.notEqual(start, -1, "board pins route must exist");
  assert.notEqual(end, -1, "board pins route boundary must exist");

  const handler = source.slice(start, end);
  assert.match(handler, /await getBoardWithOwnerCheck\(req\.params\.id, req\.userId\)/);
  assert.match(handler, /fetchAllPages\(/);
  assert.match(handler, /\.range\(from, to\)/);
  assert.doesNotMatch(handler, /for\s*\(\s*let from\s*=\s*0\s*;\s*;\s*from\s*\+=/);
});
