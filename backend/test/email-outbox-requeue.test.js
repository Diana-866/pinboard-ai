"use strict";

const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Requeueing a dead transactional email (migration 165).
 *
 * The outbox retries with backoff and then marks a row dead, which used to be the end of the line: a
 * paying customer whose subscription-activation email died was simply never told, and the only way
 * back was editing the table by hand. This is the operator's supported recovery, so the checks are
 * about refusing honestly: a refusal from the database must never reach the operator as a success.
 */

const SUPABASE = require.resolve("../supabase");
const BILLING = require.resolve("../billing");
const INDEX = path.join(__dirname, "..", "index.js");
const DEAD_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function loadBilling(db) {
  require.cache[SUPABASE] = { id: SUPABASE, filename: SUPABASE, loaded: true, exports: db };
  delete require.cache[BILLING];
  return require("../billing");
}

test("a dead email goes back into the queue and the operator learns what happened", async () => {
  const calls = [];
  const billing = loadBilling({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { requeued: true, previous_attempts: 8, template_key: "subscription_activated" }, error: null };
    },
  });

  const result = await billing.requeueEmailOutbox(` ${DEAD_ID} `);
  assert.deepEqual(result, { requeued: true, previous_attempts: 8, template_key: "subscription_activated" });
  assert.deepEqual(calls, [{ name: "requeue_email_outbox", args: { p_id: DEAD_ID } }]);
});

test("a malformed id is refused before it reaches the database", async () => {
  const calls = [];
  const billing = loadBilling({
    rpc: async (name) => { calls.push(name); return { data: null, error: null }; },
  });

  // The last entry is a UUID with an invalid variant nibble: shaped right, not a UUID.
  for (const bad of [undefined, null, "", "   ", "not-a-uuid", "1 or 1=1", "3f2504e0-4f89-41d3-7a0c-0305e82c3301"]) {
    const error = await billing.requeueEmailOutbox(bad).then(() => null, (caught) => caught);
    assert.ok(error, `id ${JSON.stringify(bad)} must be refused`);
    assert.equal(error.httpStatus, 422);
  }
  assert.deepEqual(calls, [], "no request may reach the database for an invalid id");
});

test("every refusal from the database is a coded conflict, never a silent success", async () => {
  const cases = [
    [{ requeued: false, reason: "not_dead", status: "sending" }, "not_dead", "sending"],
    [{ requeued: false, reason: "not_dead", status: "sent" }, "not_dead", "sent"],
    [{ requeued: false, reason: "not_found" }, "not_found", null],
    [{ requeued: false, reason: "content_missing" }, "content_missing", null],
    [{ requeued: false, reason: "id_required" }, "id_required", null],
  ];

  for (const [answer, reason, status] of cases) {
    const billing = loadBilling({ rpc: async () => ({ data: answer, error: null }) });
    const error = await billing.requeueEmailOutbox(DEAD_ID).then(() => null, (caught) => caught);
    assert.ok(error, `refusal ${reason} must not be reported as requeued`);
    assert.equal(error.httpStatus, 409);
    assert.equal(error.details.code, "email_not_requeueable");
    assert.equal(error.details.reason, reason);
    assert.equal(error.details.status, status);
  }

  // A garbled answer is a refusal too: the database did not confirm the requeue.
  const garbled = loadBilling({ rpc: async () => ({ data: null, error: null }) });
  const error = await garbled.requeueEmailOutbox(DEAD_ID).then(() => null, (caught) => caught);
  assert.equal(error.httpStatus, 409);
  assert.equal(error.details.reason, "unknown");
});

test("a deployment without migration 165 says which migration is missing", async () => {
  const billing = loadBilling({
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.requeue_email_outbox(p_id)" } }),
  });
  const error = await billing.requeueEmailOutbox(DEAD_ID).then(() => null, (caught) => caught);
  assert.equal(error.httpStatus, 503);
  assert.match(error.message, /миграцию 165/);
  // Section 126: a 503 never carries its text, so the migration number only reaches the operator
  // through the code. Without it this answer is the generic "internal server error".
  assert.equal(error.details?.code, "email_requeue_migration_missing");
});

test("a real database failure is a generic 503 and does not leak the cause", async () => {
  const billing = loadBilling({
    rpc: async () => ({ data: null, error: { code: "08006", message: "connection to server failed: password authentication failed" } }),
  });
  const error = await billing.requeueEmailOutbox(DEAD_ID).then(() => null, (caught) => caught);
  assert.equal(error.httpStatus, 503);
  assert.doesNotMatch(error.message, /password authentication|08006/);
});

test("the route is admin-only, rate-limited first, and passes the id straight through", () => {
  const index = fs.readFileSync(INDEX, "utf8");
  const route = /app\.post\("\/admin\/billing\/email-outbox\/:id\/requeue",([^\n]*)/.exec(index);
  assert.ok(route, "the requeue route must exist");
  assert.match(route[1], /^ adminActionLimiter, requireAuth, requireAdmin/,
    "the requeue route must apply the admin limiter before authentication");

  const handler = index.slice(index.indexOf('"/admin/billing/email-outbox/:id/requeue"'),
    index.indexOf('"/admin/accounts/login-lockout"'));
  // The id must be the path parameter, not something the caller can widen into a filter or a table name.
  assert.match(handler, /requeueEmailOutbox\(req\.params && req\.params\.id\)/);
  assert.doesNotMatch(handler, /from\("email_outbox"\)/, "the route must not reach the table directly");
});
