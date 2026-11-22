"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("calendar schedule list includes cancelled rows so the cancelled filter can work", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const start = source.indexOf('app.get("/schedule", requireAuth');
  assert.notEqual(start, -1, "schedule list route must exist");
  const end = source.indexOf('app.post("/schedule/:id/reconcile-account"', start);
  assert.notEqual(end, -1, "schedule list route boundary must exist");

  const route = source.slice(start, end);
  assert.match(route, /\.eq\("user_id", String\(req\.userId\)\)/);
  assert.match(route, /\.order\("scheduled_at", \{ ascending: true \}\)/);
  assert.doesNotMatch(route, /\.neq\(["']status["'],\s*["']cancelled["']\)/);
});


test("schedule retry metadata fails closed when a query envelope is malformed", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const start = source.indexOf('app.get("/schedule", requireAuth');
  const end = source.indexOf('app.post("/schedule/:id/reconcile-account"', start);
  const route = source.slice(start, end);

  assert.match(route, /attemptsResults\.flatMap\(readArrayQueryResult\)/);
  assert.match(route, /publicationsResults\.flatMap\(readArrayQueryResult\)/);
  assert.match(route, /accountsResults\.flatMap\(readArrayQueryResult\)/);
  assert.match(route, /retryable: false, retry_reason: "metadata_unavailable"/);
  assert.doesNotMatch(route, /result\.data\s*\|\|\s*\[\]/);
});
