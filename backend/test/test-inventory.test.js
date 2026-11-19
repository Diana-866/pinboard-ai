"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Twice in this project a file under backend/test/ was written over instead of extended, and both
 * times the loss was silent: the suite stayed green because the removed checks simply did not run.
 * The second time (backend/test/public-url.test.js, §59) the SSRF tests that already existed were
 * replaced by a shorter list, and nothing failed - only a manual glance at `git ls-files` noticed.
 *
 * This guard makes the loss loud: it records how many test declarations each file had, and a drop
 * fails. Raising the numbers is normal work; lowering one is a deliberate act that now has to be
 * visible in the diff.
 */

const TEST_DIR = __dirname;
const BASELINE_FILE = path.join(__dirname, "test-inventory.json");

/** Declarations per file, and the total. Both are checked against the recorded baseline. */
function inventory() {
  const files = fs.readdirSync(TEST_DIR)
    .filter((name) => name.endsWith(".test.js") || name.endsWith(".test.ts"))
    .sort();
  const counts = {};
  let total = 0;
  for (const name of files) {
    const source = fs.readFileSync(path.join(TEST_DIR, name), "utf8");
    const declarations = (source.match(/^[ \t]*test(?:\.\w+)?\(/gm) || []).length;
    counts[name] = declarations;
    total += declarations;
  }
  return { counts, total, files: files.length };
}

test("no test file lost declarations it already had", () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const current = inventory();

  assert.ok(baseline.files > 50, "the baseline must describe the whole suite");
  assert.ok(Object.keys(baseline.counts).length > 50, "the baseline must list the files");

  const shrunk = [];
  for (const [name, expected] of Object.entries(baseline.counts)) {
    const now = current.counts[name];
    if (now === undefined) {
      shrunk.push(`${name}: file is gone (had ${expected} declarations)`);
      continue;
    }
    if (now < expected) shrunk.push(`${name}: ${expected} -> ${now} declarations`);
  }
  assert.deepEqual(shrunk, [],
    `test coverage was removed without recording it:\n${shrunk.join("\n")}\n` +
    "If this removal is intended, lower the number in backend/test/test-inventory.json in the same commit.");

  assert.ok(current.total >= baseline.total,
    `the suite lost declarations overall: ${baseline.total} -> ${current.total}. ` +
    "Lower backend/test/test-inventory.json deliberately if that is intended.");
});

test("the recorded baseline is not stale in a way that hides new files", () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const current = inventory();
  const unrecorded = Object.keys(current.counts).filter((name) => !(name in baseline.counts));
  // A new file is not a regression, but it must be recorded so it can never silently disappear.
  assert.deepEqual(unrecorded, [],
    `new test files must be added to backend/test/test-inventory.json:\n${unrecorded.join("\n")}`);
  assert.equal(baseline.files, current.files, "the file count must match the baseline");
  assert.equal(baseline.total, current.total, "the total must match the baseline exactly once recorded");
});
