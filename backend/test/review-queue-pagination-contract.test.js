"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("GET /review-queue uses the shared bounded pager", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const start = source.indexOf('app.get("/review-queue"');
  const end = source.indexOf('app.put("/review-queue/:id"', start);
  assert.notEqual(start, -1, "GET /review-queue route must exist");
  assert.notEqual(end, -1, "review queue route boundary must exist");

  const handler = source.slice(start, end);
  assert.match(handler, /fetchAllPages\(/);
  assert.match(handler, /\.range\(from, to\)/);
  assert.doesNotMatch(handler, /for\s*\(\s*let offset\s*=\s*0\s*;\s*;\s*offset\s*\+=/);
});
