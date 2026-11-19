"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

/**
 * express-rate-limit sends Retry-After by itself, but its default body is an English string
 * with no machine-readable field, while the rest of this API answers in Russian. A throttled
 * request therefore reached the web client as an unknown failure that could only be shown as
 * "something went wrong", even though waiting would have fixed it.
 *
 * The shared responder keeps the per-limiter message, adds a code the client can localize,
 * and states in the body exactly the wait the header carries — the test pins the two
 * together so a client reading either one sees the same number.
 *
 * The behaviour is exercised over real HTTP (Express + the same handler, no Supabase), so it
 * cannot drift into a test that merely reads source text.
 */

const express = require("express");
const rateLimit = require("express-rate-limit");

const INDEX = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

/** Same helper the application uses, extracted so the test exercises the real code. */
function loadHandler() {
  const start = INDEX.indexOf("function rateLimitedHandler(message) {");
  assert.ok(start > 0, "rateLimitedHandler must exist in index.js");
  const end = INDEX.indexOf("\n}\n", start);
  const source = INDEX.slice(start, end + 3);
  // eslint-disable-next-line no-new-func
  return new Function(`${source}; return rateLimitedHandler;`)();
}

function startServer(handler) {
  const app = express();
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 2,
      standardHeaders: true,
      legacyHeaders: false,
      handler,
    })
  );
  app.get("/probe", (_req, res) => res.json({ ok: true }));
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function get(port, pathname) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: pathname }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        });
      })
      .on("error", reject);
  });
}

test("a throttled request states when to come back and why", async () => {
  const handler = loadHandler();
  const { server, port } = await startServer(handler("Слишком много запросов."));
  try {
    const first = await get(port, "/probe");
    const second = await get(port, "/probe");
    const third = await get(port, "/probe");

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    assert.equal(third.status, 429);
    const retryAfter = Number(third.headers["retry-after"]);
    assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1, `Retry-After must be positive, got ${third.headers["retry-after"]}`);
    assert.ok(retryAfter <= 60, "the wait must not exceed the window");
    assert.equal(third.body.code, "rate_limited");
    assert.equal(third.body.retryAfterSeconds, retryAfter, "the body must agree with the header");
    assert.match(third.body.error, /много/);
  } finally {
    server.close();
  }
});

test("every limiter in index.js uses the shared responder", () => {
  const limiterBlocks = INDEX.split("rateLimit({").slice(1);
  assert.equal(limiterBlocks.length, 9, "expected nine limiters: the payment webhook has its own");
  for (const block of limiterBlocks) {
    // Bound each block where it actually ends. A fixed character window silently drifted onto
    // the next limiter once a comment grew, which is how a scanner stops seeing its subject.
    const end = block.indexOf("\n});");
    assert.ok(end > 0, "a limiter config must close on its own line");
    const head = block.slice(0, end);
    assert.match(head, /handler: rateLimitedHandler\(/, "a limiter has no explicit 429 responder");
    assert.doesNotMatch(head, /message: \{ error:/, "the default responder drops Retry-After; use the shared handler");
  }
});

test("the responder never leaks internal details", () => {
  const handler = loadHandler().toString();
  for (const leak of ["stack", "supabase", "process.env", "password", "token"]) {
    assert.doesNotMatch(handler, new RegExp(leak, "i"), `429 body must not mention ${leak}`);
  }
});
