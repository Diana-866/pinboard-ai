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

function startStubServer() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => {
      calls.push({ url: req.url, method: req.method, secret: req.headers["x-pinposy-scheduler-secret"], body });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, claimed: 0 }));
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

test("the worker entry point boots with PUBLIC_BACKEND_URL as its only backend URL", async (t) => {
  const { server, calls, port } = await startStubServer();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "scheduleWorker.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PINPOSY_BACKEND_URL: "",
      PUBLIC_BACKEND_URL: `http://127.0.0.1:${port}`,
      PINPOSY_SCHEDULER_SECRET: SECRET,
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

  const deadline = Date.now() + 15_000;
  while (calls.length === 0 && Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`worker exited with code ${child.exitCode} before polling: ${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.ok(calls.length > 0, `worker did not use PUBLIC_BACKEND_URL fallback: ${output}`);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "/internal/pinterest/schedule/run");
  assert.equal(calls[0].secret, SECRET);
});

test("the worker entry point exits cleanly after SIGTERM", async (t) => {
  const { server, calls, port } = await startStubServer();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "scheduleWorker.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PINPOSY_BACKEND_URL: `http://127.0.0.1:${port}`,
      PUBLIC_BACKEND_URL: "",
      PINPOSY_SCHEDULER_SECRET: SECRET,
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

  const deadline = Date.now() + 15_000;
  while (calls.length === 0 && Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`worker exited with code ${child.exitCode} before polling: ${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(calls.length > 0, `worker did not poll before shutdown: ${output}`);

  child.kill("SIGTERM");
  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("worker did not exit after SIGTERM")), 5_000);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

  assert.equal(exitCode, 0, output);
  assert.match(output, /scheduleWorker\.event_002/);
});
