"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("Pinterest account and publication routes require an authenticated user", () => {
  const pinterest = read("pinterest.js");
  const index = read("index.js");
  for (const route of [
    'app.get("/integrations/pinterest/status", requireAuth,',
    'app.post("/integrations/pinterest/link", requireAuth,',
    'app.post("/integrations/pinterest/disconnect", requireAuth,',
    'app.get("/integrations/pinterest/boards", requireAuth,',
  ]) assert.ok(pinterest.includes(route), route);
  for (const route of [
    'app.post("/pins/:id/publish",',
    'app.post("/pins/:id/schedule", requireAuth,',
    'app.post("/schedule/:id/change-board", requireAuth,',
    'app.post("/schedule/:id/reconcile-account", requireAuth,',
  ]) {
    const at = index.indexOf(route);
    assert.notEqual(at, -1, route);
    assert.match(index.slice(at, at + 180), /requireAuth/);
  }
});

test("public OAuth entry points are protected by signed state and browser binding", () => {
  const pinterest = read("pinterest.js");
  assert.match(pinterest, /purpose: "pinterest_oauth"/);
  assert.match(pinterest, /jwt\.verify\(String\(state \|\| ""\), process\.env\.JWT_SECRET\)/);
  assert.match(pinterest, /matchesBrowserBinding\(secret, stateClaims\.browserBindingHash\)/);
  assert.match(pinterest, /matchesBrowserBinding\(browserBindingSecret, stateClaims\.browserBindingHash\)/);
  assert.match(pinterest, /begin_pinterest_oauth_attempt/);
  assert.match(pinterest, /commit_pinterest_oauth_attempt_v2/);
});

test("internal scheduler route requires a sufficiently long timing-safe secret", () => {
  const pinterest = read("pinterest.js");
  assert.match(pinterest, /expected\.length < 32/);
  assert.match(pinterest, /provided\.length !== expected\.length/);
  assert.match(pinterest, /crypto\.timingSafeEqual\(expected, provided\)/);
});

test("public Pinterest account projection never includes access or refresh credentials", () => {
  const mapper = read("pinterestPublicAccount.js");
  assert.match(mapper, /function toPublicPinterestAccount/);
  const body = mapper.slice(mapper.indexOf("function toPublicPinterestAccount"), mapper.indexOf("function toDisconnectedPinterestAccount"));
  assert.doesNotMatch(body, /access_token|refresh_token|user_id:/);
});

test("Pinterest API rate limit store is documented as process-local", () => {
  const limiter = read("pinterestRateLimit.js");
  assert.match(limiter, /default MemoryStore is process-local/);
  assert.match(limiter, /use a shared store if the backend is later scaled/);
});
