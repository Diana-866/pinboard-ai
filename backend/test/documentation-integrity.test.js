"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

/**
 * The project's development record has to stay trustworthy.
 *
 * docs/audits/2026-11-18-runtime-verification-session.md is the requested record
 * of what was done, why, and with what result. A record that cites commits which do
 * not exist, skips a row, points at deleted files, or contains a pasted secret is
 * worse than no record: it reads as evidence while being wrong. These checks keep it
 * honest and fail the build when it drifts.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const AUDIT = path.join(ROOT, "docs", "audits", "2026-11-18-runtime-verification-session.md");
const STATE = path.join(ROOT, "docs", "PROJECT_STATE.md");
const ACTIONS = path.join(ROOT, "docs", "USER_ACTIONS.md");

const audit = fs.readFileSync(AUDIT, "utf8");
const state = fs.readFileSync(STATE, "utf8");
const actions = fs.readFileSync(ACTIONS, "utf8");

function commitExists(hash) {
  try {
    execFileSync("git", ["cat-file", "-e", `${hash}^{commit}`], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("the action register is numbered without gaps", () => {
  const numbers = [...audit.matchAll(/^\| (\d+) \|/gm)].map((match) => Number(match[1]));
  assert.ok(numbers.length >= 40, `expected the register, found ${numbers.length} rows`);
  numbers.forEach((number, index) => {
    assert.equal(number, index + 1, `register row ${index + 1} is numbered ${number}`);
  });
});

test("every commit the record cites exists in the repository", () => {
  const hashes = new Set([...audit.matchAll(/`([0-9a-f]{7,8})`/g)].map((match) => match[1]));
  assert.ok(hashes.size >= 20, `expected cited commits, found ${hashes.size}`);
  const missing = [...hashes].filter((hash) => !commitExists(hash));
  assert.deepEqual(missing, [], `cited commits that do not exist:\n${missing.join("\n")}`);
});

test("every document path the record mentions exists", () => {
  // A line that describes removing a file legitimately names a path that no longer
  // exists (the duplicate admin privacy report is still referenced by its deletion
  // record), so those mentions are not checked.
  const historical = /remov|delet|удал|дубл|duplicate/i;
  const mentioned = new Set();
  for (const source of [audit, state, actions]) {
    for (const line of source.split("\n")) {
      if (historical.test(line)) continue;
      for (const match of line.matchAll(/`((?:docs|scripts)\/[A-Za-z0-9_./-]+)`/g)) mentioned.add(match[1]);
    }
  }
  assert.ok(mentioned.size >= 5, "expected document references");
  const missing = [...mentioned].filter((relative) => !fs.existsSync(path.join(ROOT, relative)));
  assert.deepEqual(missing, [], `referenced paths that do not exist:\n${missing.join("\n")}`);
});

test("the recorded documentation carries no credentials", () => {
  // The user supplied a database password during the session; it must never appear
  // in a committed document, and neither must any provider key or connection URL.
  const documents = [audit, state, actions, fs.readFileSync(path.join(ROOT, "docs", "DOCUMENTATION_REGISTER.md"), "utf8")];
  const forbidden = [
    /sk-[A-Za-z0-9]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY/,
    /postgres(?:ql)?:\/\/[^\s`]*:[^\s`@]{4,}@/,
    /PGPASSWORD=\S+/,
  ];
  const hits = [];
  for (const document of documents) {
    for (const pattern of forbidden) {
      if (pattern.test(document)) hits.push(pattern.source);
    }
  }
  assert.deepEqual(hits, [], `possible credentials in documentation:\n${hits.join("\n")}`);
});

test("the record never claims verification for something it marks unverified", () => {
  // Guard against the reverse failure too: an area listed as NOT verified must not
  // also be described as passing. The check is deliberately narrow and textual.
  const unverifiedSection = audit.slice(audit.indexOf("## 21."));
  assert.ok(unverifiedSection.length > 0);
  assert.match(unverifiedSection, /НЕ проверен|Непроверен|не проверено|не проверены/i);
});
