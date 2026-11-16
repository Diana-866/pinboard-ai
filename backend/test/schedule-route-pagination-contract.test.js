"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("GET /schedule uses the shared bounded pager", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const start = source.indexOf('app.get("/schedule"');
  const end = source.indexOf('app.post("/schedule/:id/reconcile-account"', start);
  assert.notEqual(start, -1, "GET /schedule route must exist");
  assert.notEqual(end, -1, "schedule route boundary must exist");

  const handler = source.slice(start, end);
  assert.match(handler, /fetchAllPages\(/);
  assert.match(handler, /\.range\(from, to\)/);
  assert.doesNotMatch(handler, /for\s*\(\s*let offset\s*=\s*0\s*;\s*;\s*offset\s*\+=/);
});
