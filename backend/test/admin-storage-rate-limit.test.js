const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

for (const route of [
  "/admin/storage/reconcile-stale-uploads",
  "/admin/storage/quarantine-stale-uploads",
]) {
  test(`${route} applies the admin action limiter before authentication`, () => {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `app\\.post\\(["']${escaped}["'],\\s*adminActionLimiter,\\s*requireAuth,\\s*requireAdmin,`
    );
    assert.match(source, pattern);
  });
}
