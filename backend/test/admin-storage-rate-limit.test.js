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
    const registration = `app.post("${route}", adminActionLimiter, requireAuth, requireAdmin,`;
    assert.ok(source.includes(registration), `Expected middleware chain: ${registration}`);
  });
}

test("POST /admin/mail/reply applies the admin action limiter before authentication", () => {
  const registration = 'app.post("/admin/mail/reply", adminActionLimiter, requireAuth, requireAdmin,';
  assert.ok(source.includes(registration), `Expected middleware chain: ${registration}`);
});
