"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

function routeBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing route: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `missing route boundary: ${endMarker}`);
  return source.slice(start, end);
}

test("review queue restore reads only the authenticated user's rows", () => {
  const route = routeBetween('app.get("/review-queue", requireAuth', 'app.put("/review-queue/:id"');
  assert.match(route, /\.eq\("user_id", userId\)/);
  assert.match(route, /reconciled\.invalidIds\.length/);
  assert.match(route, /httpError\(409/);
  assert.match(route, /\.delete\(\)[\s\S]*?\.eq\("user_id", userId\)[\s\S]*?\.in\("id", reconciled\.staleIds\)/);
  assert.ok(route.indexOf("reconciled.invalidIds.length") < route.indexOf(".delete()"),
    "malformed rows must fail restore before any cleanup write");
});

test("review queue writes validate payload and verify ownership before upsert", () => {
  const route = routeBetween('app.put("/review-queue/:id"', 'app.delete("/review-queue/:id"');
  assert.match(route, /normalizeReviewQueuePin\(id, payload\)/);
  assert.match(route, /getPinWithOwnerCheck\(safePayload\.pinId, req\.userId\)/);
  assert.match(route, /user_id: String\(req\.userId\)/);
  assert.match(route, /onConflict: "user_id,id"/);
});

test("review queue deletion is scoped to both row ID and authenticated owner", () => {
  const route = routeBetween('app.delete("/review-queue/:id"', '// --- Генерация пинов ---');
  assert.match(route, /\.eq\("id", id\)/);
  assert.match(route, /\.eq\("user_id", String\(req\.userId\)\)/);
});

test("review approval can only schedule an owned, approved pin to a verified account board", () => {
  const route = routeBetween('app.post("/pins/:id/schedule"', 'app.post("/schedule/:id/change-board"');
  assert.match(route, /getPinWithOwnerCheck\(req\.params\.id, req\.userId\)/);
  assert.match(route, /pin\.status !== "approved"/);
  assert.match(route, /pinterest\.resolveAccount\(req\.userId, requestedAccountId\)/);
  assert.match(route, /pinterest\.verifyPinterestBoard\(req\.userId, pinterestBoardId, selectedAccount\.id\)/);
  assert.match(route, /const snapshotPin = await getPinWithOwnerCheck\(req\.params\.id, req\.userId\)/);
  assert.match(route, /buildPinScheduleSnapshot\(snapshotPin, snapshotDestinationUrl\)/);
  assert.ok(route.indexOf("verifyPinterestBoard") < route.indexOf("const snapshotPin"),
    "the pin snapshot must be refreshed after external board verification");
});

test("schedule duplicate recovery accepts only an exact user-scoped request match", () => {
  const route = routeBetween('app.post("/pins/:id/schedule"', 'app.post("/schedule/:id/change-board"');
  assert.match(route, /\.eq\("user_id", String\(req\.userId\)\)/);
  assert.match(route, /\.eq\("pin_id", pin\.id\)/);
  assert.match(route, /\.in\("status", \["scheduled", "publishing", "published", "unknown"\]\)/);
  assert.match(route, /existing\.scheduled_at/);
  assert.match(route, /existing\.pinterest_board_id/);
  assert.match(route, /existing\.pinterest_account_id/);
  assert.match(route, /if \(sameRequest\)/);
});
