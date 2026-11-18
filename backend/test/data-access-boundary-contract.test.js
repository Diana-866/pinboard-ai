"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", "..", file), "utf8");
const backend = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("core account and content tables deny direct client grants and explicitly grant backend service role", () => {
  const sql = read("db/migrations/076_harden_core_table_client_privileges.sql");
  const expectedTables = [
    "users", "projects", "boards", "pins", "credit_transactions",
    "auth_tokens", "subscriptions", "credit_purchases",
    "pinterest_accounts", "pinterest_publications",
  ];
  for (const table of expectedTables) assert.match(sql, new RegExp("'" + table + "'"));
  assert.match(sql, /alter table public\.%I enable row level security/);
  assert.match(sql, /revoke all on table public\.%I from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, update, delete on table public\.%I to service_role/);
});

test("sensitive Pinterest and manual-review tables have explicit server-only grants", () => {
  const pinterest = read("db/migrations/039_pinterest_sensitive_table_privileges.sql");
  const review = read("db/migrations/120_harden_manual_review_queue_privileges.sql");
  for (const table of ["pinterest_accounts", "pinterest_publications"]) {
    assert.ok(pinterest.includes("revoke all on table public." + table));
    assert.ok(pinterest.includes("grant select, insert, update, delete on table public." + table));
  }
  assert.match(review, /alter table public\.pin_review_queue enable row level security/);
  assert.match(review, /revoke all on table public\.pin_review_queue\s+from public, anon, authenticated/);
  assert.match(review, /grant select, insert, update, delete on table public\.pin_review_queue\s+to service_role/);
});

test("user resource routes authenticate and derive ownership from the verified session", () => {
  const index = backend("index.js");
  for (const route of [
    'app.post("/projects", requireAuth,',
    'app.get("/projects", requireAuth,',
    'app.get("/projects/:id", requireAuth,',
    'app.post("/projects/:id/analyze", requireAuth,',
    'app.post("/projects/:id/boards/generate", requireAuth,',
    'app.get("/projects/:id/boards", requireAuth,',
    'app.patch("/pins/:id", requireAuth,',
    'app.post("/pins/:id/status", requireAuth,',
    'app.post("/pins/:id/image", requireAuth,',
    'app.post("/boards", requireAuth,',
    'app.patch("/boards/:id", requireAuth,',
    'app.get("/boards", requireAuth,',
    'app.get("/boards/:id", requireAuth,',
    'app.get("/boards/:id/pins", requireAuth,',
  ]) assert.ok(index.includes(route), route);
  assert.match(index, /req\.userId = decoded\.userId/);
  assert.match(index, /verifyToken\(token\)/);
  assert.match(index, /getBoardWithOwnerCheck\(req\.params\.id, req\.userId\)/);
  assert.match(index, /getPinWithOwnerCheck\(req\.params\.id, req\.userId\)/);
});

test("administrative authorization is loaded from the database, not request body fields", () => {
  const admin = backend("admin.js");
  assert.match(admin, /\.from\("users"\)\s*\.select\("is_admin"\)\s*\.eq\("id", req\.userId\)/);
  assert.match(admin, /!user\.is_admin/);
  assert.doesNotMatch(admin, /req\.body\.is_admin|req\.body\.role/);
});

test("dev top-up is disabled outside explicit dev/test environments and requires a server-side 32-character secret", () => {
  const route = backend("index.js");
  const guard = backend("devTopup.js");
  assert.match(route, /app\.post\("\/credits\/dev-topup", authLimiter,/);
  // Fail closed: an unset or unfamiliar NODE_ENV must not enable free credits.
  assert.match(guard, /if \(!\["development", "test"\]\.includes\(nodeEnv\) \|\| env\.ENABLE_DEV_TOPUP !== "true"\)/);
  assert.doesNotMatch(guard, /env\.NODE_ENV === "production" \|\|/);
  assert.match(guard, /configuredSecret\.length < 32/);
  assert.match(guard, /crypto\.timingSafeEqual\(expected, supplied\)/);
});
