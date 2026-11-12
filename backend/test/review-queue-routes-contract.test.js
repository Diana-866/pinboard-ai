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
