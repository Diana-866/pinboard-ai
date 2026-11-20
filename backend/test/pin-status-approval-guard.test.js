"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { assertPinCanBeApproved, assertPinCanBeRejected } = require("../pinStatusGuard");

/**
 * Section 129. `POST /pins/:id/status` guarded only the `rejected` transition. A pin that had already
 * gone out to Pinterest could be set back to `approved`: it reappeared in the review queue as if it had
 * never been published, and the only thing standing between the customer and a second pin was a fence
 * several layers down in the publication path.
 */
function fakeSupabase({ schedules = [], publications = [], error = null } = {}) {
  return {
    from(table) {
      const query = {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        limit() { return this; },
        then(resolve) {
          const rows = table === "pin_schedules" ? schedules : table === "pinterest_publications" ? publications : [];
          return Promise.resolve({ data: rows, error }).then(resolve);
        },
      };
      return query;
    },
  };
}

async function caught(run) {
  try {
    await run();
    return null;
  } catch (error) {
    return error;
  }
}

test("a pin that is already published cannot be approved again", async () => {
  const error = await caught(() => assertPinCanBeApproved(
    fakeSupabase({ publications: [{ pin_id: "pin-1" }] }), "user-1", "pin-1"
  ));
  assert.ok(error, "the transition must be refused");
  assert.equal(error.httpStatus, 409);
  assert.equal(error.details?.code, "publication_reconciliation_required");
  assert.match(error.message, /уже опубликован/);
});

test("a pin waiting in the calendar cannot be approved again", async () => {
  const error = await caught(() => assertPinCanBeApproved(
    fakeSupabase({ schedules: [{ id: "schedule-1" }] }), "user-1", "pin-1"
  ));
  assert.ok(error);
  assert.equal(error.httpStatus, 409);
  assert.equal(error.details?.code, "pin_already_scheduled");
});

test("an ordinary pin is still approved, and a failed read is not an absence", async () => {
  assert.equal(await caught(() => assertPinCanBeApproved(fakeSupabase(), "user-1", "pin-1")), null);

  const readError = Object.assign(new Error("timeout"), { code: "08006" });
  const error = await caught(() => assertPinCanBeApproved(fakeSupabase({ error: readError }), "user-1", "pin-1"));
  assert.ok(error, "a failed read must not be read as 'nothing blocks it'");
  assert.equal(error.message, "timeout");
});

test("the route actually asks the guard before writing the status", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8").replace(/\r\n/g, "\n");
  const route = source.slice(source.indexOf('app.post("/pins/:id/status"'));
  const body = route.slice(0, route.indexOf("app.", 10));
  assert.match(body, /assertPinCanBeApproved\(supabase, req\.userId, req\.params\.id\)/);
  assert.match(body, /assertPinCanBeRejected\(supabase, req\.userId, req\.params\.id\)/);
  // Both guards run before the update, or the write would land first.
  const guardIndex = body.indexOf("assertPinCanBeApproved");
  const updateIndex = body.indexOf('.update({ status })');
  assert.ok(guardIndex !== -1 && updateIndex !== -1 && guardIndex < updateIndex,
    "the guard must run before the status write");
});

test("the rejection guard is untouched by this change", async () => {
  // Rejection keeps its own blocking set: this change must not widen or narrow it.
  const error = await caught(() => assertPinCanBeRejected(
    fakeSupabase({ schedules: [{ id: "schedule-1" }] }), "user-1", "pin-1"
  ));
  assert.ok(error);
  assert.equal(error.httpStatus, 409);
});
