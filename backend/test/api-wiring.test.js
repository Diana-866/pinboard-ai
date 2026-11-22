"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { reservePort } = require("./helpers/free-port");
const path = require("node:path");
const { startFakePostgrest } = require("./helpers/fake-postgrest");

/**
 * index.js holds every customer-facing route and could not be tested at all: requiring it starts
 * an HTTP server, and its modules are wired together at load time. It was at 8.66% line coverage -
 * the largest untested surface left in the product - so the wiring (probe honesty, JSON and CORS
 * rejections, auth gates, the global rate limiter, graceful shutdown) was only ever inspected.
 *
 * Here the real entrypoint runs as a child process against a PostgREST stand-in, and the tests talk
 * to it over HTTP. Nothing in production code was changed to make this possible.
 */

const BACKEND = path.join(__dirname, "..");
const ENTRY = path.join(BACKEND, "index.js");
const API_LIMIT = 20;

async function startBackend({ apiLimit = API_LIMIT, extraEnv = {} } = {}) {
  const db = startFakePostgrest();
  const dbUrl = await db.listen();
  // См. test/helpers/free-port.js: случайный порт из диапазона сталкивается по парадоксу дней
  // рождения и даёт ложное «backend did not start».
  let port = await reservePort();

  let child = null;
  let output = "";
  let base = "";
  let ready = false;
  for (let attempt = 0; attempt < 3 && !ready; attempt += 1) {
    child = spawn(process.execPath, [ENTRY], {
      cwd: BACKEND,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        SUPABASE_URL: dbUrl,
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
        SUPABASE_ANON_KEY: "test-anon-key",
        JWT_SECRET: "test-jwt-secret-not-for-production",
        FRONTEND_URL: "https://app.example.com",
        API_RATE_LIMIT_MAX: String(apiLimit),
        API_RATE_LIMIT_WINDOW_MS: "60000",
        ACCOUNT_DELETION_WORKER_ENABLED: "",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });

    base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`${base}/health`);
        if (response.ok) { ready = true; break; }
      } catch {
        // not listening yet
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) {
      child.kill("SIGKILL");
      port = await reservePort();
    }
  }
  if (!ready) {
    await db.close();
    throw new Error(`backend did not start:\n${output}`);
  }

  return {
    base,
    db,
    child,
    output: () => output,
    async stop() {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await new Promise((resolve) => child.once("exit", resolve));
      }
      await db.close();
    },
  };
}

async function request(backend, pathname, init = {}) {
  const response = await fetch(`${backend.base}${pathname}`, { redirect: "manual", ...init });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, headers: response.headers };
}

test("liveness is dependency-free and readiness reports the database honestly", async () => {
  const backend = await startBackend();
  try {
    const health = await request(backend, "/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.ok(Number.isInteger(health.body.uptime_seconds));
    assert.equal(
      backend.db.requests.filter((entry) => entry.path.includes("users")).length,
      0,
      "liveness must not touch the database, or a slow query becomes a restart loop"
    );

    const ready = await request(backend, "/ready");
    assert.equal(ready.status, 200);
    assert.deepEqual(ready.body, { ok: true });
    assert.ok(
      backend.db.requests.some((entry) => entry.path === "/rest/v1/users"),
      "readiness must actually probe the database"
    );
  } finally {
    await backend.stop();
  }
});

test("a database that fails the probe makes readiness fail", async () => {
  const backend = await startBackend();
  try {
    // The probe is the only thing that touches users; make it fail.
    backend.db.table("GET", "users", { status: 500, body: { message: "connection refused" } });
    const ready = await request(backend, "/ready");
    assert.equal(ready.status, 503);
    assert.deepEqual(ready.body, { ok: false, error: "database_unavailable" });
  } finally {
    await backend.stop();
  }
});

test("probes are never throttled, while ordinary routes are", async () => {
  const backend = await startBackend({ apiLimit: 5 });
  try {
    for (let i = 0; i < 12; i += 1) {
      const probe = await request(backend, "/health");
      assert.equal(probe.status, 200, "a platform probe must never receive 429");
    }

    let throttled = null;
    for (let i = 0; i < 10; i += 1) {
      const response = await request(backend, "/billing/credit-packs");
      if (response.status === 429) { throttled = response; break; }
      assert.equal(response.status, 200);
    }
    assert.ok(throttled, "the global limiter must eventually answer 429");
    assert.match(throttled.body.error, /Слишком много запросов/);
    assert.equal(throttled.body.code, "rate_limited", "the client needs a code it can localize");
    assert.ok(
      Number.isInteger(throttled.body.retryAfterSeconds) && throttled.body.retryAfterSeconds > 0,
      "the body must state the wait: the UI shows it as a countdown"
    );
    const wait = Number(throttled.headers.get("retry-after"));
    assert.ok(
      Math.abs(wait - throttled.body.retryAfterSeconds) <= 1,
      `the header (${wait}) and the body (${throttled.body.retryAfterSeconds}) must agree, or the UI and the browser disagree`
    );

    // The payment webhook carries money notifications and is exempt from the browser budget.
    const webhook = await request(backend, "/billing/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.notEqual(webhook.status, 429, "a provider callback must not be throttled by a browser limit");
  } finally {
    await backend.stop();
  }
});

test("the public catalogue is served without a token and with real content", async () => {
  const backend = await startBackend();
  try {
    const plans = await request(backend, "/billing/plans");
    assert.equal(plans.status, 200);
    assert.equal(plans.body.provider, "prodamus");
    assert.ok(Array.isArray(plans.body.plans) && plans.body.plans.length > 0);
    for (const plan of plans.body.plans) {
      assert.equal(typeof plan.id, "string");
      assert.ok(plan.id.length > 0);
      assert.ok(plan.title && plan.title.length > 0, `${plan.id} must have a title to show`);
      assert.ok(Number.isFinite(plan.amount && plan.amount.rub) && plan.amount.rub > 0, `${plan.id} needs a rouble price`);
    }

    const packs = await request(backend, "/billing/credit-packs");
    assert.equal(packs.status, 200);
    assert.ok(Array.isArray(packs.body.packs) && packs.body.packs.length > 0);
    assert.deepEqual(
      backend.db.requests.filter((entry) => /credit|prodamus|plans/i.test(entry.path)).map((entry) => entry.path),
      [],
      "the catalogue must come from code, not from the database, so pricing cannot 500 when the DB is slow"
    );
  } finally {
    await backend.stop();
  }
});

test("a broken JSON body is a 400 with a readable reason, not a 500", async () => {
  const backend = await startBackend();
  try {
    const response = await request(backend, "/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"email": "a@b.c",,}',
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Некорректный JSON в запросе");
  } finally {
    await backend.stop();
  }
});

test("an unlisted origin is refused by CORS while the app origin is allowed", async () => {
  const backend = await startBackend();
  try {
    const rejected = await request(backend, "/billing/plans", {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "GET",
      },
    });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.body.error, "Домен не разрешён");

    const allowed = await request(backend, "/billing/plans", {
      method: "OPTIONS",
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": "GET",
      },
    });
    assert.ok(allowed.status < 300, `allowed preflight got ${allowed.status}`);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.example.com");
  } finally {
    await backend.stop();
  }
});

test("every protected route answers 401 without a token, with the code the client maps", async () => {
  const backend = await startBackend();
  try {
    const protectedPaths = [
      "/me",
      "/credits",
      "/billing/subscriptions",
      "/projects",
      "/boards",
      "/boards/11111111-2222-4333-8444-555555555555/pins",
      "/analytics/summary",
    ];
    for (const pathname of protectedPaths) {
      const response = await request(backend, pathname);
      assert.equal(response.status, 401, `${pathname} must require a token`);
      assert.ok(response.body && typeof response.body.error === "string", pathname);
    }

    const garbage = await request(backend, "/me", { headers: { authorization: "Bearer not-a-jwt" } });
    assert.equal(garbage.status, 401, "an unverifiable token must not be treated as anonymous access");
  } finally {
    await backend.stop();
  }
});

test("request validation happens before the database is consulted", async () => {
  const backend = await startBackend();
  try {
    const badEmail = await request(backend, "/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "Str0ng!pass" }),
    });
    assert.equal(badEmail.status, 422);
    assert.match(badEmail.body.error, /email/i);

    const weakPassword = await request(backend, "/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "123" }),
    });
    assert.equal(weakPassword.status, 422);
    assert.match(weakPassword.body.error, /пароль|password/i);

    const emptyLogin = await request(backend, "/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(emptyLogin.status, 422);

    assert.deepEqual(
      backend.db.requests.filter((entry) =>
        entry.path.startsWith("/auth/") ||
        (entry.path === "/rest/v1/users" && entry.method !== "GET")
      ).map((entry) => `${entry.method} ${entry.path}`),
      [],
      "a rejected request must never reach the database with a write or an account creation"
    );
  } finally {
    await backend.stop();
  }
});

test("an unknown route answers a JSON 404 instead of an HTML default", async () => {
  const backend = await startBackend();
  try {
    const response = await request(backend, "/this/route/does/not/exist");
    assert.equal(response.status, 404);
    assert.equal(typeof response.body, "object");
    assert.ok(response.body && typeof response.body.error === "string" && response.body.error.length > 0);
  } finally {
    await backend.stop();
  }
});

// Graceful shutdown is deliberately not asserted here: on Windows a child process cannot receive
// SIGTERM (kill() terminates it outright), so the handler below could only be tested by reading it.
// It is recorded as an open check for a POSIX environment rather than claimed as verified.
