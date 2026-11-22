"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("review queue reads every page and bounds reconciliation requests", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const start = source.indexOf('app.get("/review-queue", requireAuth');
  assert.notEqual(start, -1, "review queue route must exist");
  const end = source.indexOf('\napp.', start + 10);
  assert.notEqual(end, -1, "review queue route boundary must exist");
  const route = source.slice(start, end);

  // The bounded shared pager replaces the previous hand-written page loop.
  assert.match(route, /fetchAllPages\(\(from, to\) =>/);
  assert.match(route, /\.range\(from, to\)/);
  assert.match(route, /pinIds\.slice\(index \* 200, \(index \+ 1\) \* 200\)/);
  assert.match(route, /reconciled\.staleIds\.slice\(offset, offset \+ 200\)/);
  assert.match(route, /\.eq\("user_id", userId\)/);
});

test("review queue excludes pins with active or uncertain persisted schedules", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const start = source.indexOf('app.get("/review-queue", requireAuth');
  const end = source.indexOf('\napp.', start + 10);
  const route = source.slice(start, end);

  assert.match(route, /\.in\("status", \["scheduled", "publishing", "published", "unknown"\]\)/);
  assert.match(route, /reconcileReviewQueueRows\(rows, pinsById, userId, scheduledPinIds\)/);
});


test("review queue validates related query envelopes before reconciliation", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const start = source.indexOf('app.get("/review-queue", requireAuth');
  const end = source.indexOf('\napp.', start + 10);
  const route = source.slice(start, end);

  assert.match(route, /readArrayQueryResult\(result\)/);
  assert.doesNotMatch(route, /result\.data\s*\|\|\s*\[\]/);
  assert.ok(
    route.indexOf("readArrayQueryResult(result)") < route.indexOf("reconcileReviewQueueRows"),
    "malformed related reads must be rejected before reconciliation or cleanup"
  );
});
