require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

/**
 * Boot smoke test for the publication worker.
 *
 * `npm run worker` is a separate process that production runs next to the API.
 * Like the API, it only reveals configuration problems at startup: a missing
 * PINPOSY_BACKEND_URL or a short secret makes it exit without ever polling, and
 * no unit test notices because they all construct the worker directly.
 *
 * The test starts the real entry point against a local HTTP stub and asserts that
 * it actually calls the internal scheduler endpoint with the secret header.
 */
const SECRET = "s".repeat(40);

function startStubServer(responseData = { ok: true, claimed: 0 }, statusCode = 200) {
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
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, calls, port: server.address().port });
    });
  });
}

test("the worker entry point boots and calls the internal scheduler endpoint", async (t) => {
  const { server, calls, port } = await startStubServer();

  const child = spawn(process.execPath, [path.join(__dirname, "..", "scheduleWorker.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PINPOSY_BACKEND_URL: `http://127.0.0.1:${port}`,
      PINPOSY_SCHEDULER_SECRET: SECRET,
      // Keep the first tick immediate and the loop short for the test.
      PINPOSY_SCHEDULER_INTERVAL_MS: "5000",
      PINPOSY_SCHEDULER_REQUEST_TIMEOUT_MS: "10000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
    server.close();
  });

  // The worker polls on start; wait for the first request rather than a fixed sleep.
  const deadline = Date.now() + 15_000;
  while (calls.length === 0 && Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`worker exited with code ${child.exitCode} before polling: ${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.ok(calls.length > 0, `worker never called the scheduler endpoint: ${output}`);
  const first = calls[0];
  assert.equal(first.method, "POST");
  assert.equal(first.url, "/internal/pinterest/schedule/run");
  assert.equal(first.secret, SECRET, "the worker must authenticate with its secret header");
  assert.doesNotMatch(output, /process\.uncaught_exception|unhandled_rejection/);
});

test("the worker refuses to start without a usable configuration", async (t) => {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "scheduleWorker.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PINPOSY_BACKEND_URL: "",
      PUBLIC_BACKEND_URL: "",
      PINPOSY_SCHEDULER_SECRET: "short",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.notEqual(code, 0, "a worker without configuration must fail loudly, not idle");
  assert.match(output, /scheduleworker\.event_003/);
});


test("the one-shot worker entry point performs exactly one scheduler request and exits", async (t) => {
  const { server, calls, port } = await startStubServer();
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
    server.close();
  });

  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`one-shot worker did not exit: ${output}`));
    }, 15_000);
    child.once("exit", (exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  });

  assert.equal(code, 0);
  assert.equal(calls.length, 1, "one cron invocation must make exactly one backend request");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "/internal/pinterest/schedule/run");
  assert.equal(calls[0].secret, SECRET);
});


test("the one-shot worker exits nonzero when the backend rejects the scheduler request", async (t) => {
  const { server, calls, port } = await startStubServer({ error: "temporary failure" }, 503);
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
    server.close();
  });

  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`failed one-shot worker did not exit: ${output}`));
    }, 15_000);
    child.once("exit", (exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  });

  assert.equal(code, 1, "Cron must be able to detect backend failures and retry on a later invocation");
  assert.equal(calls.length, 1, "a failed cron invocation must not loop in the same process");
});

test("the one-shot worker treats an overlapping busy response as a successful no-op", async (t) => {
  const { server, calls, port } = await startStubServer({
    ok: true,
    busy: true,
    claimed: 0,
    published: 0,
    failed: 0,
    scheduled: 0,
    unknown: 0,
    results: [],
  });
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
    server.close();
  });

  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`busy one-shot worker did not exit: ${output}`));
    }, 15_000);
    child.once("exit", (exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  });

  assert.equal(code, 0, "a valid busy response is not a worker failure");
  assert.equal(calls.length, 1, "a busy cron invocation must make only one request");
  assert.equal(calls[0].secret, SECRET);
});


test("one-shot worker never schedules a follow-up timer after success or failure", async () => {
  const { createWorker } = require("../scheduleWorker");
  let scheduled = 0;
  const schedule = () => { scheduled += 1; return { unref() {} }; };
  const logger = { info() {}, error() {} };

  const successfulWorker = createWorker({
    config: { endpoint: "https://backend.example/internal/pinterest/schedule/run", secret: SECRET },
    client: { async post() { return { data: { ok: true, claimed: 0 } }; } },
    logger,
    oneShot: true,
    schedule,
  });
  assert.equal(await successfulWorker.tick(), true);
  assert.equal(scheduled, 0, "successful one-shot invocation must not schedule another tick");

  const failedWorker = createWorker({
    config: { endpoint: "https://backend.example/internal/pinterest/schedule/run", secret: SECRET },
    client: { async post() { throw new Error("temporary network failure"); } },
    logger,
    oneShot: true,
    schedule,
  });
  assert.equal(await failedWorker.tick(), false);
  assert.equal(scheduled, 0, "failed one-shot invocation must exit for the cron host to retry later");
});



test("one-shot worker destroys its dedicated HTTP agents after the request", async () => {
  const { createWorker } = require("../scheduleWorker");
  let requestConfig;
  const destroyed = { http: 0, https: 0 };
  const worker = createWorker({
    config: { endpoint: "https://backend.example/internal/pinterest/schedule/run", secret: SECRET },
    client: {
      async post(_url, _body, config) {
        requestConfig = config;
        for (const [key, agent] of [["http", config.httpAgent], ["https", config.httpsAgent]]) {
          const destroy = agent.destroy.bind(agent);
          agent.destroy = () => { destroyed[key] += 1; return destroy(); };
        }
        return { data: { ok: true, claimed: 0 } };
      },
    },
    logger: { info() {}, error() {} },
    oneShot: true,
  });

  assert.equal(await worker.tick(), true);
  assert.equal(requestConfig.httpAgent.keepAlive, false);
  assert.equal(requestConfig.httpsAgent.keepAlive, false);
  assert.deepEqual(destroyed, { http: 1, https: 1 });
});


test("one-shot worker releases both agents when the backend request fails", async () => {
  const { createWorker } = require("../scheduleWorker");
  const destroyed = { http: 0, https: 0 };
  const worker = createWorker({
    config: { endpoint: "https://backend.example/internal/pinterest/schedule/run", secret: SECRET },
    client: {
      async post(_url, _body, config) {
        for (const [key, agent] of [["http", config.httpAgent], ["https", config.httpsAgent]]) {
          const destroy = agent.destroy.bind(agent);
          agent.destroy = () => { destroyed[key] += 1; return destroy(); };
        }
        throw new Error("simulated network failure");
      },
    },
    logger: { info() {}, error() {} },
    oneShot: true,
  });

  assert.equal(await worker.tick(), false);
  assert.deepEqual(destroyed, { http: 1, https: 1 });
});


test("one-shot worker rejects every tick after its first attempt", async () => {
  const { createWorker } = require("../scheduleWorker");
  let requests = 0;
  const worker = createWorker({
    config: { endpoint: "https://backend.example/internal/pinterest/schedule/run", secret: SECRET },
    client: {
      async post() {
        requests += 1;
        return { data: { ok: true, claimed: 0 } };
      },
    },
    logger: { info() {}, error() {} },
    oneShot: true,
  });

  assert.equal(await worker.tick(), true);
  assert.equal(await worker.tick(), false);
  assert.equal(await worker.tick(), false);
  assert.equal(requests, 1, "one-shot worker instance must issue at most one request");
});


test("scheduler worker rejects incomplete 200 responses but accepts complete and busy responses", () => {
  const { isValidSchedulerResponse } = require("../scheduleWorker");
  assert.equal(isValidSchedulerResponse({ ok: true }), false);
  assert.equal(isValidSchedulerResponse({ ok: true, claimed: 0 }), false);
  assert.equal(isValidSchedulerResponse({
    ok: true, claimed: 0, published: 0, failed: 0, scheduled: 0, unknown: 0,
  }), true);
  assert.equal(isValidSchedulerResponse({ ok: true, busy: true }), true);
  assert.equal(isValidSchedulerResponse({
    ok: true, claimed: -1, published: 0, failed: 0, scheduled: 0, unknown: 0,
  }), false);
});


test("one-shot worker reports an incomplete 200 response as a failed invocation", async () => {
  const { createWorker } = require("../scheduleWorker");
  const errors = [];
  const worker = createWorker({
    config: { endpoint: "https://backend.example/internal/pinterest/schedule/run", secret: SECRET },
    client: { async post() { return { data: { ok: true } }; } },
    logger: { info() {}, error(event) { errors.push(event); } },
    oneShot: true,
  });

  assert.equal(await worker.tick(), false);
  assert.deepEqual(errors, ["schedule_worker.batch_failed"]);
});
