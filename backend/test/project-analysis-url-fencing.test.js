"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("site analysis only saves results for the exact URL that was analyzed", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const start = source.indexOf('app.post("/projects/:id/analyze"');
  const end = source.indexOf('app.post("/keywords"', start);
  assert.notEqual(start, -1, "site analysis route must exist");
  assert.notEqual(end, -1, "site analysis route boundary must exist");

  const handler = source.slice(start, end);
  assert.match(handler, /\.eq\("website_url", project\.website_url\)/);
  assert.match(handler, /\.maybeSingle\(\)/);
  assert.match(handler, /if\s*\(!updated\)[\s\S]*?httpError\(409/);
  assert.match(handler, /analyzeSite\(project\.website_url\)/);
});
