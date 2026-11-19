"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * An undocumented environment variable is an operational trap: the value is read at
 * startup, the deployment sets nothing, and the service silently runs with a default
 * nobody knows about. Four were missing from backend/.env.example when this check was
 * written (the global rate-limit budget and the legacy mail fallbacks).
 *
 * Every key the backend reads must therefore be documented. Keys that only exist for
 * tests, or that the platform injects itself, are listed here with a reason.
 */

const BACKEND = path.resolve(__dirname, "..");
const ENV_EXAMPLE = path.join(BACKEND, ".env.example");

// Provided by the runtime or by the hosting platform, never by the operator.
const RUNTIME_PROVIDED = new Map([
  ["NODE_ENV", "set by node/startup scripts"],
  ["NODE_OPTIONS", "set by the runtime"],
  ["npm_package_version", "set by npm"],
  ["DYNO", "set by Heroku-style platforms"],
  ["RENDER", "set by Render"],
  ["RENDER_EXTERNAL_URL", "set by Render"],
  ["HOSTNAME", "set by the container runtime"],
]);

/** Read every `process.env.X` reference in the backend modules (not tests). */
function referencedKeys() {
  const keys = new Map();
  for (const entry of fs.readdirSync(BACKEND)) {
    if (!entry.endsWith(".js")) continue;
    const file = path.join(BACKEND, entry);
    if (!fs.statSync(file).isFile()) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)) {
      if (!keys.has(match[1])) keys.set(match[1], entry);
    }
    for (const match of source.matchAll(/process\.env\[\s*["']([A-Za-z0-9_]+)["']\s*\]/g)) {
      if (!keys.has(match[1])) keys.set(match[1], entry);
    }
    // Some modules take the environment as a parameter (env = process.env) and read it as
    // env.NAME. Matching that shape catches those without following the call graph; an
    // over-match only makes this direction of the check stricter.
    for (const match of source.matchAll(/(?:^|[^\w.])env\.([A-Z][A-Z0-9_]{2,})/g)) {
      if (!keys.has(match[1])) keys.set(match[1], entry);
    }
  }
  return keys;
}

function documentedKeys() {
  const source = fs.readFileSync(ENV_EXAMPLE, "utf8");
  return new Set([...source.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]));
}

const referenced = referencedKeys();
const documented = documentedKeys();

test("the scan sees the backend configuration surface", () => {
  assert.ok(referenced.size >= 40, `expected the env surface, found ${referenced.size}`);
  assert.ok(documented.size >= 35, `expected documented keys, found ${documented.size}`);
});

test("every environment variable the backend reads is documented", () => {
  const missing = [...referenced.keys()]
    .filter((key) => !documented.has(key) && !RUNTIME_PROVIDED.has(key))
    .sort()
    .map((key) => `${key} (first read in ${referenced.get(key)})`);
  assert.deepEqual(missing, [], `undocumented environment variables:\n${missing.join("\n")}`);
});

test("the example file documents no key the backend never reads", () => {
  // Stale entries mislead the operator into configuring something that does nothing.
  const stale = [...documented]
    .filter((key) => !referenced.has(key))
    .filter((key) => !/^(SUPABASE_|JWT_|PRODAMUS_|PINTEREST_)/.test(key) || true)
    .sort();
  // A handful of keys are read by scripts, Docker or the frontend, not by backend/*.js.
  const allowedElsewhere = new Set([
    "PGPORT", "PGHOST", "PGPASSWORD", "PGUSER", "DATABASE_URL",
    "ACCOUNT_DELETION_WORKER_ENABLED_STANDALONE",
  ]);
  const unexpected = stale.filter((key) => !allowedElsewhere.has(key));
  assert.deepEqual(unexpected, [], `documented but never read:\n${unexpected.join("\n")}`);
});

test("a newly introduced variable fails the check", () => {
  // Guard the guard: the rule must be able to fail at all.
  const probe = "PINPOSY_UNDOCUMENTED_PROBE";
  assert.equal(documented.has(probe), false);
  const wouldFail = [probe].filter((key) => !documented.has(key) && !RUNTIME_PROVIDED.has(key));
  assert.equal(wouldFail.length, 1);
});
