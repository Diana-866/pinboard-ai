require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

const { asError } = require("../dbErrors");

test("a Supabase error object becomes a real Error with its message and code", () => {
  const wrapped = asError({ message: "duplicate key value violates unique constraint", code: "23505", details: "d", hint: "h" });
  assert.ok(wrapped instanceof Error);
  assert.equal(wrapped.message, "duplicate key value violates unique constraint");
  assert.equal(wrapped.code, "23505");
  assert.equal(wrapped.details, "d");
  assert.equal(String(wrapped), "Error: duplicate key value violates unique constraint");
});

test("an existing Error is passed through untouched", () => {
  const original = new Error("already an error");
  assert.equal(asError(original), original);
});

test("values without a message fall back instead of rendering [object Object]", () => {
  assert.equal(asError({ code: "XX000" }, "database error").message, "database error");
  assert.equal(asError(null, "database error").message, "database error");
  assert.equal(asError(undefined, "database error").message, "database error");
  assert.equal(asError("plain string", "database error").message, "database error");
});

test("a numeric provider code is normalized to a string", () => {
  assert.equal(asError({ message: "bad", code: 500 }).code, "500");
});
