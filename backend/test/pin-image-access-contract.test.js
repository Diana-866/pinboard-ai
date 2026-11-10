const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relative) => fs.readFileSync(path.join(__dirname, "..", "..", relative), "utf8");

test("pin image upload is authenticated and verifies pin ownership before Storage write", () => {
  const index = read("backend/index.js");
  const start = index.indexOf('app.post("/pins/:id/image", requireAuth');
  assert.notEqual(start, -1);
  const route = index.slice(start, start + 2200);
  const ownerCheck = route.indexOf("getPinWithOwnerCheck(req.params.id, req.userId)");
  const upload = route.indexOf("await uploadPinImage(req.file)");
  assert.ok(ownerCheck >= 0);
  assert.ok(upload > ownerCheck);
  assert.match(route, /\.eq\("id", req\.params\.id\)/);
  assert.match(route, /\.eq\("board_id", pin\.board_id\)/);
  assert.match(route, /applyPinImageCompareAndSwapFilter/);
});

test("pin image bucket is intentionally public and configuration fails closed on drift", () => {
  const storage = read("backend/storage.js");
  const lifecycle = read("backend/pinImageLifecycle.js");
  assert.match(storage, /createBucket\(BUCKET,\s*\{\s*public:\s*true/);
  assert.match(storage, /validatePinImageBucketConfiguration/);
  assert.match(lifecycle, /bucket\.public !== true/);
  assert.match(lifecycle, /configuredMimes\.length !== expectedMimes\.length/);
});

test("current English privacy policy explains public image URL access and cache limits", () => {
  const policy = read("frontend/src/legal/privacy-policy.en.md");
  assert.match(policy, /public object-storage bucket/i);
  assert.match(policy, /without signing in to PinPosy/i);
  assert.match(policy, /Do not upload confidential documents/i);
  assert.match(policy, /cached by browsers\/CDNs/i);
});
