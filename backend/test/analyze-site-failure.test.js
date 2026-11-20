"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { siteFetchFailure } = require("../analyze");

/**
 * Section 106. The first step of onboarding is "paste your website". When the site answered 403 or
 * did not resolve, `/analyze` threw 502 with a helpful sentence — and a 502 never carries its
 * message, so the customer read "внутренняя ошибка сервера, попробуйте позже" and support could not
 * tell "our bug" from "their site blocks bots".
 *
 * A site that cannot be read is a condition about the customer's own input, so it answers 422 with
 * a machine code the client localizes. The site's own status still crosses, because "blocked by
 * Cloudflare" and "this address does not exist" need different advice.
 */

function failureFor(error) {
  return siteFetchFailure(error);
}

test("a site that answered with an error becomes a client error with a code", () => {
  const failure = failureFor({ response: { status: 403 } });
  assert.equal(failure.httpStatus, 422, "a blocked site is not a server fault");
  assert.equal(failure.details.code, "website_unreachable");
  assert.equal(failure.details.websiteStatus, 403);
  // The Russian text stays for the log and for support; the client renders the code.
  assert.match(failure.message, /403/);
});

test("a site that does not resolve carries the code and no invented status", () => {
  const failure = failureFor(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
  assert.equal(failure.httpStatus, 422);
  assert.equal(failure.details.code, "website_unreachable");
  assert.equal(failure.details.websiteStatus, undefined, "a network failure has no HTTP status to report");
});

test("an unusable status is not turned into a number the customer would read", () => {
  for (const status of ["403", 0, -1, 999, 4.5, null, undefined, Number.NaN, {}]) {
    const failure = failureFor({ response: { status } });
    assert.equal(failure.httpStatus, 422, `status ${JSON.stringify(status)}`);
    assert.equal(failure.details.code, "website_unreachable");
    assert.equal(failure.details.websiteStatus, undefined, `status ${JSON.stringify(status)} must not be reported`);
  }
});

test("no error at all is still a client error, not a crash", () => {
  for (const value of [null, undefined, 42, "boom"]) {
    const failure = failureFor(value);
    assert.equal(failure.httpStatus, 422);
    assert.equal(failure.details.code, "website_unreachable");
  }
});

test("analyze.js never answers a provider failure with a message-dropping 5xx again", () => {
  // The rule that made the defect invisible: on >= 500 only a machine code crosses the boundary, so
  // any helpful sentence written there is thrown away. This asserts the whole file, not one branch.
  const source = fs.readFileSync(path.join(__dirname, "..", "analyze.js"), "utf8");
  assert.equal(/httpError\(\s*5\d\d/.test(source), false, "analyze.js must not raise a 5xx without a machine code");
  assert.equal(/siteFetchFailure\(e\)/.test(source), true, "the fetch failure must go through the mapping");
});
