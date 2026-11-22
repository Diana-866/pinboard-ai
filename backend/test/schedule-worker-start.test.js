"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

/**
 * День 4 плана: воркер публикаций запускается и действительно стучится в backend.
 *
 * Поднимается настоящий HTTP-сервер и запускается настоящая точка входа `scheduleWorker.js`.
 * Проверяется то, что нельзя увидеть в фабрике: адрес, секрет в заголовке, тело запроса и то,
 * что процесс живёт после первого опроса (независимый таймер когда-то давал чистый выход 0,
 * и публикации молча останавливались).
 */
const ENTRY = path.join(__dirname, "..", "scheduleWorker.js");
const SECRET = "worker-start-secret-with-32-characters";

function startFakeBackend(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      handler(req, res, requests.length);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, requests, port: server.address().port });
    });
  });
}

function startWorker(port, env = {}) {
  const child = spawn(process.execPath, [ENTRY], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PINPOSY_BACKEND_URL: `http://127.0.0.1:${port}`,
      PINPOSY_SCHEDULER_SECRET: SECRET,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  return { child, output: () => output };
}

async function waitFor(predicate, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

test("the worker sends the scheduler secret to the real endpoint", async () => {
  const backend = await startFakeBackend((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, claimed: 0, published: 0, failed: 0, scheduled: 0, unknown: 0 }));
  });
  const worker = startWorker(backend.port);
  try {
    const got = await waitFor(() => backend.requests.length > 0);
    assert.ok(got, `the worker never called the backend:\n${worker.output()}`);
    const request = backend.requests[0];
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/internal/pinterest/schedule/run", "the path is the worker's contract");
    assert.equal(request.headers["x-pinposy-scheduler-secret"], SECRET, "the secret must travel in its own header");
    assert.deepEqual(JSON.parse(request.body), { limit: 1 }, "one row per request keeps a lease short");
  } finally {
    worker.child.kill("SIGKILL");
    backend.server.close();
  }
});

test("the worker survives a rejected call instead of exiting cleanly", async () => {
  // Раньше независимый таймер давал процессу завершиться с кодом 0 после первого опроса:
  // супервизор считал это нормой, а расписание публикаций стояло.
  const backend = await startFakeBackend((req, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid secret" }));
  });
  // Короткий интервал опроса: боевой backoff после отказа дошёл бы до минут.
  const worker = startWorker(backend.port, { PINPOSY_SCHEDULER_INTERVAL_MS: "5000" });
  try {
    const called = await waitFor(() => backend.requests.length >= 2, 25_000);
    assert.ok(called, `the worker stopped polling after a rejection:\n${worker.output()}`);
    assert.equal(worker.child.exitCode, null, "a rejected poll must not end the process");
    assert.match(worker.output(), /schedule_worker|scheduleWorker/, "the failure must be logged, not swallowed");
  } finally {
    worker.child.kill("SIGKILL");
    backend.server.close();
  }
});

test("a broken configuration stops the worker with a non-zero code", async () => {
  const worker = startWorker(1, { PINPOSY_SCHEDULER_SECRET: "too-short" });
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      worker.child.kill("SIGKILL");
      resolve("did-not-exit");
    }, 10_000);
    worker.child.once("exit", (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
  assert.equal(code, 1, "a worker without a usable secret must not pretend to be running");
  // Имена событий журнал пишет в нижнем регистре, поэтому сравнение без учёта регистра.
  assert.match(worker.output(), /scheduleworker\.event_003/i);
});
