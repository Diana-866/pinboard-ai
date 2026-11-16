"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("direct publish status recovery is authenticated and owner-scoped", () => {
  const source = read("pinterest.js");
  const start = source.indexOf('app.get("/pins/:id/publish-status"');
  const end = source.indexOf('app.post(\n    "/pins/:id/publish"', start);
  assert.notEqual(start, -1, "publish-status route exists");
  assert.ok(end > start, "status route ends before the publish route");
  const route = source.slice(start, end);
  assert.match(route, /requireAuth/);
  assert.match(route, /getPinWithOwner\(req\.params\.id, req\.userId\)/);
  assert.match(route, /\.eq\("user_id", String\(req\.userId\)\)/);
  assert.match(route, /\.eq\("pin_id", req\.params\.id\)/);
  assert.match(route, /\.eq\("pinterest_account_id", accountId\)/);
  assert.match(route, /publication\.pinterest_pin_id/);
  assert.match(route, /status: "published"/);
  assert.match(route, /status: "not_found"/);
  assert.doesNotMatch(route, /\.rpc\(|callPinterest\(|\.update\(/);
});

test("publish button checks uncertain outcomes instead of blindly retrying", () => {
  const button = fs.readFileSync(
    path.join(__dirname, "..", "..", "frontend", "src", "components", "pins", "PublishPinButton.tsx"),
    "utf8"
  );
  assert.match(button, /const handleCheckStatus = async/);
  assert.match(button, /publish-status\?account_id=/);
  assert.match(button, /readConfirmedPinterestPublish\(result, checkingBoardId\)/);
  assert.match(button, /onClick=\{handleCheckStatus\}/);
  assert.match(button, /повторная отправка остаётся заблокированной/i);
});
