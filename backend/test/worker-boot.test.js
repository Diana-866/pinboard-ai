require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const SECRET = "s".repeat(40);

function startStubServer(responseData = { ok: true, claimed: 0, published: 0, failed: 0, scheduled: 0, unknown: 0 }, statusCode = 200) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => {
      calls.push({ url: req.url, method: req.method, secret: req.headers["x-pinposy-scheduler-secret"], body });
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(responseData));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, calls, port: server.address().port }));
  });
}

function runOneShot(port, t) {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "scheduleWorker.js"), "--once"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PINPOSY_BACKEND_URL: `http://127.0.0.1:${port}`,
      PINPOSY_SCHEDULER_SECRET: SECRET,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  const exited = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`one-shot worker did not exit: ${output}`));
    }, 15_000);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve({ code, output });
    });
  });
  return { child, exited, getOutput: () => output };
}

test("one-shot worker makes exactly one authenticated request and exits successfully", async (t) => {
  const { server, calls, port } = await startStubServer();
  t.after(() => server.close());
  const { exited } = runOneShot(port, t);
  const { code } = await exited;
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "/internal/pinterest/schedule/run");
  assert.equal(calls[0].secret, SECRET);
});

test("one-shot worker exits nonzero on backend failure so cron can retry", async (t) => {
  const { server, calls, port } = await startStubServer({ error: "temporary failure" }, 503);
  t.after(() => server.close());
  const { exited } = runOneShot(port, t);
  const { code } = await exited;
  assert.equal(code, 1);
  assert.equal(calls.length, 1);
});

test("one-shot worker accepts an overlapping busy response as a successful no-op", async (t) => {
  const { server, calls, port } = await startStubServer({ ok: true, busy: true });
  t.after(() => server.close());
  const { exited } = runOneShot(port, t);
  const { code } = await exited;
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
});

test("one-shot worker never schedules a follow-up timer and only permits one tick", async () => {
  const { createWorker } = require("../scheduleWorker");
  let scheduled = 0;
  let requests = 0;
  const worker = createWorker({
    config: { endpoint: "https://backend.example/internal/pinterest/schedule/run", secret: SECRET },
    client: { async post() { requests += 1; return { data: { ok: true, claimed: 0, published: 0, failed: 0, scheduled: 0, unknown: 0 } }; } },
    logger: { info() {}, error() {} },
    oneShot: true,
    schedule() { scheduled += 1; return { unref() {} }; },
  });
  assert.equal(await worker.tick(), true);
  assert.equal(await worker.tick(), false);
  assert.equal(requests, 1);
  assert.equal(scheduled, 0);
});

test("one-shot worker releases dedicated non-keep-alive HTTP agents on success and failure", async () => {
  const { createWorker } = require("../scheduleWorker");
  for (const shouldFail of [false, true]) {
    let captured;
    let destroyed = 0;
    const worker = createWorker({
      config: { endpoint: "https://backend.example/internal/pinterest/schedule/run", secret: SECRET },
      client: {
        async post(_url, _body, config) {
          captured = config;
          for (const agent of [config.httpAgent, config.httpsAgent]) {
            const destroy = agent.destroy.bind(agent);
            agent.destroy = () => { destroyed += 1; return destroy(); };
          }
          if (shouldFail) throw new Error("temporary");
          return { data: { ok: true, claimed: 0, published: 0, failed: 0, scheduled: 0, unknown: 0 } };
        },
      },
      logger: { info() {}, error() {} },
      oneShot: true,
    });
    assert.equal(await worker.tick(), !shouldFail);
    assert.equal(captured.httpAgent.keepAlive, false);
    assert.equal(captured.httpsAgent.keepAlive, false);
    assert.equal(destroyed, 2);
  }
});

test("scheduler response validation rejects incomplete success payloads", () => {
  const { isValidSchedulerResponse } = require("../scheduleWorker");
  assert.equal(isValidSchedulerResponse({ ok: true }), false);
  assert.equal(isValidSchedulerResponse({ ok: true, claimed: 0 }), false);
  assert.equal(isValidSchedulerResponse({ ok: true, busy: true }), true);
  assert.equal(isValidSchedulerResponse({
    ok: true, claimed: 0, published: 0, failed: 0, scheduled: 0, unknown: 0,
  }), true);
  assert.equal(isValidSchedulerResponse({
    ok: true, claimed: -1, published: 0, failed: 0, scheduled: 0, unknown: 0,
  }), false);
});
