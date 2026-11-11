const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const net = require("node:net");

/**
 * Boot smoke test.
 *
 * The process is started exactly the way production starts it (`node index.js`).
 * It exists because a ReferenceError inside a route registration (an exported
 * name that was never imported) does not fail any unit test: the module is only
 * evaluated on boot, and the deployed process then dies immediately.
 */

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

async function waitForHealth(port, child, deadlineMs = 15_000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < deadlineMs) {
    if (child.exitCode !== null) {
      throw new Error(`server exited with code ${child.exitCode} before answering /health`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        const body = await response.json();
        if (body && body.ok === true) return body;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server did not answer /health: ${lastError && lastError.message}`);
}

test("the production entry point boots and answers unauthenticated probes", async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "index.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      SUPABASE_URL: "https://boot-test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "boot-test-key",
      JWT_SECRET: "boot-test-secret",
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

  // A protected route must reject an anonymous caller instead of crashing.
  const unauthorized = await fetch(`http://127.0.0.1:${port}/me`);
  assert.equal(unauthorized.status, 401);

  // The root probe stays a plain text greeting used by uptime checks.
  const root = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(root.status, 200);
  assert.equal((await root.text()).trim(), "OK");

  assert.doesNotMatch(output, /uncaught_exception|unhandled_rejection/);
});
