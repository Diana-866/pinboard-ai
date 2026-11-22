"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

/**
 * Дни 3–4 и 10–11 плана: внешняя проверка живости. Проверяется на настоящем HTTP-сервере
 * на loopback, потому что «скрипт печатает OK» без запроса ничего не доказывает.
 */
const ROOT = path.join(__dirname, "..", "..");
const SCRIPT = path.join(ROOT, "deploy", "healthcheck.sh");
const hasBash = spawnSync("bash", ["-c", "exit 0"], { encoding: "utf8" }).status === 0;

function startServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function runHealthcheck(args) {
  return new Promise((resolve) => {
    const child = spawn("bash", [SCRIPT, ...args], { encoding: "utf8" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("the script parses", (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  assert.ok(fs.existsSync(SCRIPT));
  assert.equal(spawnSync("bash", ["-n", SCRIPT], { encoding: "utf8" }).status, 0);
});

test("a healthy service is reported once and exits zero", async (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const { server, base } = await startServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, uptime: 1 }));
  });
  try {
    const result = await runHealthcheck(["--url", `${base}/health`]);
    assert.equal(result.code, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout.trim().split("\n").length, 1, "a monitor parses one line");
    assert.match(result.stdout, /healthcheck: OK/);
  } finally {
    server.close();
  }
});

test("a server error is a failure, not a success", async (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const { server, base } = await startServer((req, res) => {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false }));
  });
  try {
    const result = await runHealthcheck(["--url", `${base}/health`, "--retries", "1"]);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /FAIL/);
    assert.match(result.stdout, /503/);
  } finally {
    server.close();
  }
});

test("a 200 page that is not the service is still a failure", async (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  // Прокси или заглушка отвечает 200 HTML — это не готовый backend.
  const { server, base } = await startServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html>maintenance</html>");
  });
  try {
    const result = await runHealthcheck(["--url", `${base}/health`, "--retries", "1"]);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /without ok:true/);
  } finally {
    server.close();
  }
});

test("ok:false inside a 200 answer is a failure", async (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const { server, base } = await startServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, reason: "db down" }));
  });
  try {
    const result = await runHealthcheck(["--url", `${base}/health`, "--retries", "1"]);
    assert.equal(result.code, 1);
  } finally {
    server.close();
  }
});

test("a dead service is retried and then reported", async (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const { server, base } = await startServer((req, res) => res.end("ok"));
  const deadUrl = `${base}/health`;
  await new Promise((resolve) => server.close(resolve));
  const result = await runHealthcheck(["--url", deadUrl, "--timeout", "2", "--retries", "2"]);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /attempt 1\/2/);
  assert.match(result.stdout, /attempt 2\/2/);
});

test("an empty address cannot look healthy", async (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  for (const args of [[], ["--url", ""]]) {
    const result = await runHealthcheck(args);
    assert.equal(result.code, 2, `args ${JSON.stringify(args)} must be a usage error`);
    assert.match(result.stderr, /usage: healthcheck\.sh --url/);
  }
});
