"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const net = require("node:net");

/**
 * Дни 10–11 плана: заголовки безопасности и HTTPS-редирект.
 *
 * Проверка идёт по настоящему HTTP от настоящей точки входа: заголовки ставит middleware
 * цепочка, и только живой ответ доказывает, что они доходят до клиента.
 */
const JWT_SECRET = "pinposy-security-headers-secret-32+bytes";

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
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`server did not answer /health: ${lastError && lastError.message}`);
}

async function withServer(t) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "index.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      SUPABASE_URL: "https://security-headers.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "security-headers-key",
      JWT_SECRET,
      EMAIL_OUTBOX_DISPATCH_INTERVAL_MS: "0",
      ACCOUNT_DELETION_WORKER_ENABLED: "false",
      SCHEDULE_WORKER_ENABLED: "false",
      API_RATE_LIMIT_MAX: "1000",
      API_RATE_LIMIT_WINDOW_MS: "60000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  await waitForHealth(port, child);
  return `http://127.0.0.1:${port}`;
}

test("the framework does not advertise itself", async (t) => {
  const base = await withServer(t);
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  // `X-Powered-By: Express` — бесплатная подсказка для поиска известных уязвимостей.
  assert.equal(response.headers.get("x-powered-by"), null, "x-powered-by must be removed");
});

test("the answer carries the security headers", async (t) => {
  const base = await withServer(t);
  const response = await fetch(`${base}/health`);
  const headers = response.headers;
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.match(headers.get("strict-transport-security") || "", /max-age=\d{7,}/);
  assert.match(headers.get("content-security-policy") || "", /default-src/);
  assert.equal(headers.get("referrer-policy"), "no-referrer");
  assert.ok(headers.get("x-frame-options"), "framing must be restricted");
  assert.ok(headers.get("x-request-id"), "every answer must be traceable");
});

test("error answers keep the same headers", async (t) => {
  const base = await withServer(t);
  // Ошибка не должна выпадать из-под middleware: иначе 404 и 401 приходят без защиты.
  const response = await fetch(`${base}/me`, { headers: { authorization: "Bearer broken" } });
  assert.ok(response.status >= 400, `expected a rejection, got ${response.status}`);
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const body = await response.json();
  assert.ok(body && typeof body === "object", "the error must be JSON, not an HTML stack trace");
  assert.ok(!/at .*\(.*:\d+:\d+\)/.test(JSON.stringify(body)), "no stack traces in the body");
});
