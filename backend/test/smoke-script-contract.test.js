"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * scripts/smoke-backend.sh is the operator's check against a running service (staging in
 * UA-066, and after a deploy). A smoke check that always passes is worse than none: it
 * would report a healthy service while /me answered 200 to anonymous callers. These
 * assertions pin the parts that make the script meaningful.
 */
const SCRIPT = path.resolve(__dirname, "..", "..", "scripts", "smoke-backend.sh");
const source = fs.readFileSync(SCRIPT, "utf8");

test("the script refuses to run without a target and validates its arguments", () => {
  assert.match(source, /--base-url is required/);
  assert.match(source, /must start with http:\/\/ or https:\/\//);
  assert.match(source, /--expect-ready must be ok, fail or any/);
  assert.match(source, /--timeout must be a positive integer/);
  // A usage error must not look like a passing run.
  assert.match(source, /exit 2/);
});

test("every check increments the counter and a failure increments the failure count", () => {
  // Two assignment sites per check would be one missing increment away from a false pass.
  const checkFunctions = ["check_status", "check_status_one_of"];
  for (const name of checkFunctions) {
    const body = source.slice(source.indexOf(`${name}()`), source.indexOf("\n}", source.indexOf(`${name}()`)));
    assert.match(body, /CHECKS=\$\(\(CHECKS \+ 1\)\)/, `${name} must count its check`);
    assert.match(body, /FAILURES=\$\(\(FAILURES \+ 1\)\)/, `${name} must count its failure`);
  }
  assert.match(source, /FAILURES=\$\(\(FAILURES \+ 1\)\)[\s\S]*RESULT: FAIL/);
});

test("the security-relevant expectations are present", () => {
  // Anonymous access to customer and admin routes must be 401, not "any 4xx".
  assert.match(source, /check_status "anonymous access refused" "401"/);
  assert.match(source, /check_status "anonymous admin refused" "401"/);
  // An unsigned webhook must be refused; 200 here would mean anyone can activate a plan.
  assert.match(source, /unsigned webhook refused/);
  assert.match(source, /403\|400\)/);
  // Liveness must be expected to work regardless of the database.
  assert.match(source, /check_status "liveness" "200"/);
});

test("no credential is ever printed", () => {
  // The token is passed through curl's argument list and never echoed.
  assert.doesNotMatch(source, /echo[^\n]*\$TOKEN/);
  assert.doesNotMatch(source, /printf[^\n]*\$TOKEN/);
  assert.match(source, /The token is never echoed/);
  // Response bodies are discarded for authenticated checks: they are customer data.
  assert.match(source, /request_status GET \/me "\$TOKEN"/);
});

test("timeouts are bounded so a sleeping host cannot hang the check", () => {
  assert.match(source, /TIMEOUT_SECONDS=20/);
  assert.ok((source.match(/--max-time "\$TIMEOUT_SECONDS"/g) || []).length >= 3);
});
