"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

const { respondWithError } = require("../httpErrorResponse");

/**
 * The error boundary decides what the customer and the client code can see. Two rules matter:
 *
 *  - a machine code must cross the boundary at every status, because it is what turns a Russian
 *    server message into the customer's language. It did not: every status >= 500 dropped the
 *    whole `details` object, which disabled the localized Pinterest messages on every route that
 *    throws instead of answering directly.
 *  - nothing else may cross on a server-side failure, because `details` can carry an email, a
 *    provider payload or an internal identifier - and a 500 is exactly when that must not leak.
 *
 * A response double records what the client would actually receive.
 */

function capture() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

function error(status, message, details) {
  const created = new Error(message);
  created.httpStatus = status;
  if (details !== undefined) created.details = details;
  return created;
}

test("a machine code crosses the boundary on a server-side failure", () => {
  const res = capture();
  respondWithError(res, error(503, "Pinterest недоступен", { code: "pinterest_unavailable" }));

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "pinterest_unavailable", "the client localizes by this code");
  // The internal wording still does not reach the customer.
  assert.doesNotMatch(res.body.error, /Pinterest недоступен/);
});

test("nothing else crosses the boundary on a server-side failure", () => {
  const res = capture();
  respondWithError(res, error(500, "boom", {
    code: "internal_failure",
    email: "customer@example.com",
    sql: "insert into subscriptions ...",
    stack: "at doThing (/app/secret.js:1:1)",
    providerPayload: { pan: "4111111111111111" },
  }));

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, "internal_failure");
  const serialized = JSON.stringify(res.body);
  for (const secret of ["customer@example.com", "insert into", "/app/secret.js", "4111111111111111", "boom"]) {
    assert.equal(serialized.includes(secret), false, `${secret} must not leak`);
  }
  assert.deepEqual(Object.keys(res.body).sort(), ["code", "error"]);
});

test("client errors still carry all of their details", () => {
  const res = capture();
  respondWithError(res, error(403, "Подтвердите email", {
    code: "email_not_verified",
    emailSent: true,
    retryAfterSeconds: 120,
    email: "customer@example.com",
  }));

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    error: "Подтвердите email",
    code: "email_not_verified",
    emailSent: true,
    retryAfterSeconds: 120,
    email: "customer@example.com",
  });
});

test("a code that is not a non-empty string is ignored, not forwarded as-is", () => {
  for (const details of [{ code: "" }, { code: "   " }, { code: 42 }, { code: null }, { code: {} }]) {
    const res = capture();
    respondWithError(res, error(502, "provider", details));
    assert.deepEqual(Object.keys(res.body), ["error"], `${JSON.stringify(details)} must not produce a code field`);
  }
});

test("the fallback messages are honest about what the client can do", () => {
  const server = capture();
  respondWithError(server, error(500, "raw internal text"));
  assert.equal(server.body.error, "Внутренняя ошибка сервера, попробуйте позже");
  assert.doesNotMatch(server.body.error, /raw internal text/);

  const client = capture();
  respondWithError(client, error(400, "Проверьте поле"));
  assert.equal(client.body.error, "Проверьте поле");

  const unknown = capture();
  respondWithError(unknown, new Error("no status"));
  assert.equal(unknown.statusCode, 500, "an error without a status is a server failure");
});

test("an explicit public message or status overrides the thrown one", () => {
  const res = capture();
  respondWithError(res, error(503, "internal detail", { code: "payment_provider_unavailable" }), "Оплата временно недоступна", 502);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, "Оплата временно недоступна");
  assert.equal(res.body.code, "payment_provider_unavailable");
});

test("a thrown non-object does not crash the boundary", () => {
  for (const thrown of [undefined, null, "plain string", 42, { httpStatus: 418 }]) {
    const res = capture();
    assert.doesNotThrow(() => respondWithError(res, thrown));
    assert.ok(Number.isInteger(res.statusCode), `${String(thrown)} must still produce a status`);
    assert.ok(res.body && typeof res.body.error === "string");
  }
});
