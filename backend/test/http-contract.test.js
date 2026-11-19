"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const net = require("node:net");

/**
 * HTTP contract test.
 *
 * The production entry point is booted once and exercised over real HTTP. Unit
 * tests replace every dependency with a double, so they cannot prove that the
 * middleware chain actually rejects anonymous callers, that malformed requests
 * map to the documented status codes, or that the webhook parser refuses
 * unsupported content types. These are the failure modes that reach users.
 *
 * No database call is expected here: the Supabase URL is a non-resolvable host
 * and only routes that answer before touching the database are exercised.
 */

const JWT_SECRET = "pinposy-http-contract-secret-with-32+bytes";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port, child, deadlineMs = 20_000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < deadlineMs) {
    if (child.exitCode !== null) {
      throw new Error(`server exited with code ${child.exitCode} before answering /health`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok && (await response.json()).ok === true) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`server did not answer /health: ${lastError && lastError.message}`);
}

async function withServer(t, { rateLimitMax = 1000 } = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "index.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      SUPABASE_URL: "https://http-contract.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "http-contract-key",
      JWT_SECRET,
      // Keep the in-process outbox dispatcher from firing during the test.
      EMAIL_OUTBOX_DISPATCH_INTERVAL_MS: "0",
      ACCOUNT_DELETION_WORKER_ENABLED: "false",
      SCHEDULE_WORKER_ENABLED: "false",
      // The default is deliberately high so flow tests are never throttled;
      // the throttle test starts its own process with a small budget.
      API_RATE_LIMIT_MAX: String(rateLimitMax),
      API_RATE_LIMIT_WINDOW_MS: "60000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });

  await waitForHealth(port, child);
  return {
    base: `http://127.0.0.1:${port}`,
    transcript: () => output,
  };
}

test("anonymous callers are rejected by the authenticated API surface", async (t) => {
  const { base } = await withServer(t);

  for (const [method, route] of [
    ["GET", "/me"],
    ["GET", "/projects"],
    ["GET", "/boards"],
    ["GET", "/schedule"],
    ["GET", "/review-queue"],
    ["GET", "/analytics/summary"],
    ["GET", "/credits"],
    ["GET", "/account/export"],
    ["GET", "/billing/subscriptions"],
    ["GET", "/billing/credit-purchases"],
    ["POST", "/billing/create-payment"],
    ["POST", "/billing/credits"],
    ["GET", "/admin/stats"],
    ["GET", "/admin/pinterest/schedules"],
    ["POST", "/admin/provider-refunds/generation/reconcile"],
    ["GET", "/integrations/pinterest/status"],
    ["GET", "/integrations/pinterest/boards"],
  ]) {
    const response = await fetch(`${base}${route}`, { method });
    assert.equal(response.status, 401, `${method} ${route} must reject anonymous callers`);
  }
});

test("a forged bearer token never reaches a route handler", async (t) => {
  const { base } = await withServer(t);

  for (const token of [
    "not-a-jwt",
    // Signature produced with a different secret: structurally valid, untrusted.
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJpYXQiOjE3MDAwMDAwMDB9.invalidsignature",
  ]) {
    const response = await fetch(`${base}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 401, "forged token must be rejected with 401");
  }
});

test("the payment webhook refuses unsigned and unsupported requests", async (t) => {
  const { base } = await withServer(t);

  const unsigned = await fetch(`${base}/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_id: "pp-1", payment_status: "success" }),
  });
  assert.ok(
    unsigned.status >= 400 && unsigned.status < 500,
    `unsigned webhook must be rejected as a client error, got ${unsigned.status}`
  );
  const unsignedBody = await unsigned.json();
  assert.equal(unsignedBody.ok === true, false, "unsigned webhook must not report success");

  const wrongContentType = await fetch(`${base}/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "order_id=pp-1",
  });
  assert.equal(wrongContentType.status, 415);

  const oversized = await fetch(`${base}/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_id: "pp-1", padding: "x".repeat(40_000) }),
  });
  assert.ok(
    oversized.status === 413 || oversized.status === 400,
    `oversized webhook body must be rejected, got ${oversized.status}`
  );
});

test("payment notifications are not throttled by the browser request budget", async (t) => {
  // A provider retry storm after an outage is legitimate traffic, and dropping a payment
  // notification is worse than any flood this budget protects against. The webhook must
  // therefore ignore the global per-client budget, while still being bounded itself and
  // still refusing an unsigned body.
  const { base } = await withServer(t, { rateLimitMax: 5 });

  const statuses = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${base}/billing/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: `pp-${attempt}`, payment_status: "success" }),
    });
    statuses.push(response.status);
  }

  assert.equal(statuses.includes(429), false, `the webhook must not inherit the browser budget: ${statuses.join(",")}`);
  // Every one of them is still rejected as unsigned.
  assert.equal(statuses.every((status) => status >= 400 && status < 500), true, statuses.join(","));
  // Meanwhile the ordinary API surface is throttled by the same small budget.
  let sawThrottle = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(`${base}/me`);
    if (response.status === 429) { sawThrottle = true; break; }
  }
  assert.equal(sawThrottle, true, "the global budget must still apply to browser traffic");
});

test("malformed request bodies and unknown routes map to documented statuses", async (t) => {
  const { base } = await withServer(t);

  const malformed = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(malformed.status, 400);
  assert.equal(typeof (await malformed.json()).error, "string");

  const unknown = await fetch(`${base}/definitely-not-a-route`);
  assert.equal(unknown.status, 404);

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true);
  assert.equal(typeof healthBody.uptime_seconds, "number");
});

test("readiness reports an unreachable database instead of claiming health", async (t) => {
  // The booted process points at a non-resolvable Supabase host, so readiness
  // must fail closed with 503 while liveness stays 200. A health endpoint that
  // always answers ok would keep a broken deployment in the load balancer.
  const { base } = await withServer(t);

  const ready = await fetch(`${base}/ready`);
  assert.equal(ready.status, 503);
  const body = await ready.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "database_unavailable");
});

test("the global request budget throttles a single client with 429", async (t) => {
  // Every authenticated read route is covered by one shared budget keyed by the
  // bearer token (or the client IP when anonymous); without it a single account
  // could exhaust the database quota for everyone.
  const { base } = await withServer(t, { rateLimitMax: 5 });
  const statuses = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(`${base}/definitely-not-a-route`);
    statuses.push(response.status);
  }

  assert.deepEqual(statuses.slice(0, 5), [404, 404, 404, 404, 404]);
  assert.equal(statuses[5], 429, `expected a throttle after the budget, got ${statuses.join(",")}`);
  assert.equal(statuses[7], 429);

  // Liveness probes are skipped so platform health checks keep working.
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
});

test("public plan and credit-pack catalogues stay database-free", async (t) => {
  const { base, transcript } = await withServer(t);

  for (const route of ["/billing/plans", "/billing/credit-packs"]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, `${route} must answer without a database`);
    const body = await response.json();
    assert.ok(body && typeof body === "object", `${route} must return JSON`);
  }

  assert.doesNotMatch(transcript(), /uncaught_exception|unhandled_rejection/);
});
