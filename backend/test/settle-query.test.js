"use strict";

require("./helpers/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const { settleQuery } = require("../settleQuery");

/** The thenable supabase-js hands back: `then` only, exactly like @supabase/postgrest-js 2.116.0. */
function builderLike(result, error) {
  return {
    then(onFulfilled, onRejected) {
      return error
        ? Promise.reject(error).then(onFulfilled, onRejected)
        : Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

test("a supabase builder has no catch, so awaiting it directly is the only safe way", async () => {
  const builder = builderLike({ data: 1 });
  assert.equal(typeof builder.then, "function");
  assert.equal(typeof builder.catch, "undefined", "if this ever gains .catch the guard below is obsolete");
  await assert.rejects(async () => builderLike(null, new Error("boom")).catch(() => {}));
});

test("settleQuery returns the builder result when the query succeeds", async () => {
  const value = await settleQuery(builderLike({ data: [{ id: "row" }] }));
  assert.deepEqual(value, { data: [{ id: "row" }] });
});

test("settleQuery runs the error handler instead of throwing when the query fails", async () => {
  const seen = [];
  const value = await settleQuery(builderLike(null, new Error("network")), (error) => {
    seen.push(error.message);
  });
  assert.deepEqual(seen, ["network"]);
  assert.equal(value, null, "a swallowed failure must not look like a successful empty result");
});

test("settleQuery awaits an asynchronous error handler before returning", async () => {
  const order = [];
  await settleQuery(builderLike(null, new Error("late")), async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push("handler finished");
  });
  order.push("returned");
  assert.deepEqual(order, ["handler finished", "returned"]);
});

test("settleQuery rethrows when no handler is given, so a caller cannot swallow by accident", async () => {
  await assert.rejects(() => settleQuery(builderLike(null, new Error("unhandled"))), /unhandled/);
});
