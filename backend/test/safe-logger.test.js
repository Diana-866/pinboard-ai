const test = require("node:test");
const assert = require("node:assert/strict");
const { logError, logWarning, logInfo, runWithCorrelationId } = require("../safeLogger");

test("logs only the allowlisted event, status, and normalized error code", () => {
  const original = console.error;
  const output = [];
  console.error = (value) => output.push(value);
  try {
    logError("billing.webhook_failed", { code: "ECONNRESET", message: "token=secret-value" }, 503);
  } finally {
    console.error = original;
  }
  assert.equal(output.length, 1);
  assert.deepEqual(JSON.parse(output[0]), {
    level: "error",
    event: "billing.webhook_failed",
    status: 503,
    error_code: "ECONNRESET",
  });
  assert.equal(output[0].includes("secret-value"), false);
});

test("does not serialize nested causes, provider payloads, or stack traces", () => {
  const original = console.error;
  const output = [];
  console.error = (value) => output.push(value);
  try {
    const error = new Error("Authorization: Bearer top-secret");
    error.response = { data: { access_token: "nested-secret", email: "person@example.com" } };
    error.cause = { message: "refresh_token=another-secret" };
    logError("pinterest.callback_failed", error, 500);
  } finally {
    console.error = original;
  }
  assert.equal(output.length, 1);
  for (const secret of ["top-secret", "nested-secret", "another-secret", "person@example.com", "Authorization"]) {
    assert.equal(output[0].includes(secret), false, secret);
  }
});

test("normalizes event names and ignores unsafe error codes and invalid statuses", () => {
  const original = console.error;
  const output = [];
  console.error = (value) => output.push(value);
  try {
    logError("Payment webhook\nsecret", { code: "token=secret" }, 200);
  } finally {
    console.error = original;
  }
  assert.deepEqual(JSON.parse(output[0]), {
    level: "error",
    event: "payment_webhook_secret",
  });
});

test("handles null, primitive, and hostile error objects without leaking details", () => {
  const original = console.error;
  const output = [];
  console.error = (value) => output.push(value);
  try {
    logError("generic", null, 500);
    logError("generic", "private details", 500);
    logError("generic", { get code() { throw new Error("do-not-log"); } }, 500);
  } finally {
    console.error = original;
  }
  assert.equal(output.length, 3);
  assert.ok(output.every((line) => !line.includes("private") && !line.includes("do-not-log")));
});

test("warning and info events use the same safe event-name contract", () => {
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const warnings = [];
  const infos = [];
  console.warn = (value) => warnings.push(value);
  console.info = (value) => infos.push(value);
  try {
    logWarning("auth.login_rejected", { message: "email=private@example.com" }, 401);
    logInfo("pinterest.oauth_connected");
  } finally {
    console.warn = originalWarn;
    console.info = originalInfo;
  }
  assert.deepEqual(JSON.parse(warnings[0]), {
    level: "warn",
    event: "auth.login_rejected",
    status: 401,
  });
  assert.deepEqual(JSON.parse(infos[0]), {
    level: "info",
    event: "pinterest.oauth_connected",
  });
  assert.equal(warnings[0].includes("private@example.com"), false);
});

test("correlation ID is attached to logs inside async request context only", async () => {
  const original = console.error;
  const output = [];
  console.error = (value) => output.push(value);
  const correlationId = "123e4567-e89b-12d3-a456-426614174000";
  try {
    await runWithCorrelationId(correlationId, async () => {
      await Promise.resolve();
      logError("http.request_failed", { message: "private payload" }, 500);
    });
    logError("outside.request", null, 500);
  } finally {
    console.error = original;
  }
  assert.deepEqual(JSON.parse(output[0]), {
    level: "error",
    event: "http.request_failed",
    status: 500,
    correlation_id: correlationId,
  });
  assert.deepEqual(JSON.parse(output[1]), {
    level: "error",
    event: "outside.request",
    status: 500,
  });
});

test("correlation context rejects arbitrary caller-controlled values", () => {
  const original = console.info;
  const output = [];
  console.info = (value) => output.push(value);
  try {
    runWithCorrelationId("email=person@example.com", () => logInfo("test.event"));
  } finally {
    console.info = original;
  }
  assert.deepEqual(JSON.parse(output[0]), { level: "info", event: "test.event" });
});
