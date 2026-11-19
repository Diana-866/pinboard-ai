"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * supabase-js issues plain fetch requests with no timeout. A database connection that stops
 * answering therefore holds the HTTP request open until the platform's TCP timeout — minutes,
 * while the caller's own deadline is 45 seconds. Every query is now bounded by a wrapper that
 * is small enough to test directly.
 */

const { buildTimedFetch, readSupabaseTimeoutMs, DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS } = require("../supabaseTimeout");

const neverSettles = () => new Promise(() => {});

test("a request that never settles is aborted after the budget", async () => {
  const fetchImpl = buildTimedFetch(neverSettles, 25);
  const started = Date.now();
  let aborted = false;

  await assert.rejects(
    () =>
      fetchImpl("https://db.example/rest/v1/x", {}).catch((error) => {
        aborted = true;
        throw error;
      }),
    /abort/i
  );
  assert.equal(aborted, true);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 20, `must wait for the budget, waited ${elapsed}ms`);
  assert.ok(elapsed < 2000, `must not wait far beyond the budget, waited ${elapsed}ms`);
});

test("the wrapper passes the signal through and resolves a normal response", async () => {
  let seenSignal = null;
  const fetchImpl = buildTimedFetch(async (input, init) => {
    seenSignal = init.signal;
    return { ok: true, url: String(input) };
  }, 50);

  const response = await fetchImpl("https://db.example/rest/v1/x", { method: "GET" });

  assert.equal(response.ok, true);
  assert.ok(seenSignal instanceof AbortSignal, "the query must be abortable");
  assert.equal(seenSignal.aborted, false);
});

test("a caller that supplies its own signal keeps control", async () => {
  const controller = new AbortController();
  let received = null;
  const fetchImpl = buildTimedFetch(async (input, init) => {
    received = init.signal;
    return { ok: true };
  }, 50);

  await fetchImpl("https://db.example/rest/v1/x", { signal: controller.signal });
  assert.equal(received, controller.signal, "an explicit signal must not be replaced");
});

test("a synchronous throw still clears the timer and propagates", () => {
  const fetchImpl = buildTimedFetch(() => {
    throw new Error("boom");
  }, 50);
  assert.throws(() => fetchImpl("https://db.example/x", {}), /boom/);
});

test("no usable fetch means no wrapper, so supabase keeps its own default", () => {
  assert.equal(buildTimedFetch(undefined, 50), undefined);
  assert.equal(buildTimedFetch(null, 50), undefined);
  assert.equal(buildTimedFetch("nope", 50), undefined);
});

test("the configured budget is sane and bounded", () => {
  assert.equal(readSupabaseTimeoutMs({}), DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS);
  assert.equal(readSupabaseTimeoutMs({ SUPABASE_REQUEST_TIMEOUT_MS: "5000" }), 5000);
  // Nonsense is ignored rather than turned into an instant-abort.
  assert.equal(readSupabaseTimeoutMs({ SUPABASE_REQUEST_TIMEOUT_MS: "abc" }), DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS);
  assert.equal(readSupabaseTimeoutMs({ SUPABASE_REQUEST_TIMEOUT_MS: "-5" }), DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS);
  // Absurd values are clamped, not honoured.
  assert.equal(readSupabaseTimeoutMs({ SUPABASE_REQUEST_TIMEOUT_MS: "1" }), 1000);
  assert.equal(readSupabaseTimeoutMs({ SUPABASE_REQUEST_TIMEOUT_MS: "99999999" }), 120_000);
});

test("the client is built with the timed fetch", () => {
  const source = require("node:fs").readFileSync(require.resolve("../supabase.js"), "utf8");
  assert.match(source, /global: \{ fetch: buildTimedFetch\(globalThis\.fetch, readSupabaseTimeoutMs\(\)\) \}/);
});
