"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(
  path.join(__dirname, "..", "..", "scripts", "verify.sh"),
  "utf8"
);

test("local migration replay starts from the canonical baseline", () => {
  assert.match(script, /canonical baseline: 001_baseline\.sql|canonical baseline missing: 001_baseline\.sql/);
  assert.match(script, /local baseline="\$scratch\/migrations\/001_baseline\.sql"/);
});

test("local migration replay skips diagnostic and historical migrations below 010", () => {
  assert.match(script, /prefix="\$\{base%%_\*\}"/);
  assert.match(script, /10#\$prefix < 10/);
  assert.doesNotMatch(script, /for migration in "\$scratch"\/migrations\/\*\.sql/);
  assert.doesNotMatch(script, /db\/archive/);
});

test("verification fallback does not claim an unverified GitHub billing cause", () => {
  assert.doesNotMatch(script, /billing\/spending limit/);
  assert.match(script, /fail before their first step/);
});
