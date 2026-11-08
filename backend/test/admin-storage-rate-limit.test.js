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


for (const route of ["/billing/create-payment", "/billing/credits"]) {
  test(route + " applies the payment creation limiter after authentication", () => {
    const registration = 'app.post("' + route + '", requireAuth, paymentCreationLimiter,';
    assert.ok(source.includes(registration), "Expected middleware chain: " + registration);
  });
}


test("POST /resend-verification applies a dedicated outbound-mail limiter", () => {
  const registration = 'app.post("/resend-verification", resendVerificationLimiter,';
  assert.ok(source.includes(registration), `Expected middleware chain: ${registration}`);
  assert.ok(source.includes("const resendVerificationLimiter = rateLimit({"));
});


test("AI generation routes share a per-authenticated-user limiter", () => {
  assert.ok(
    source.includes("keyGenerator: (req) => String(req.userId)"),
    "Expected the AI limiter to key by the verified user ID"
  );
  for (const route of [
    "/projects/:id/analyze",
    "/projects/:id/boards/generate",
    "/pins/:id/regenerate",
    "/boards/:id/pins/generate",
  ]) {
    const registration = 'app.post("' + route + '", requireAuth, aiLimiter,';
    assert.ok(source.includes(registration), "Expected authenticated per-user AI limiter: " + registration);
  }
});
