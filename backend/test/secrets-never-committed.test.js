"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Section 156. The owner refused to put SMTP credentials into `backend/.env` because she feared
 * they would "fly to GitHub". That fear was well founded as a habit check — and unfounded as a fact:
 * `.env` is ignored and has never been in history. A fact that is only true today is not a guarantee,
 * so it is pinned here: no environment file may be tracked, and both ignore rules must stay.
 */

const repoRoot = path.join(__dirname, "..", "..");

function git(...args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

test("no environment file is tracked by git", () => {
  const tracked = git("ls-files").split("\n");
  const forbidden = tracked.filter((file) => {
    const base = path.basename(file);
    return base === ".env" || (base.startsWith(".env.") && base !== ".env.example");
  });
  assert.deepEqual(forbidden, [], `these files must never be committed:\n${forbidden.join("\n")}`);
});

test("both ignore rules stay in place", () => {
  const backendIgnore = fs.readFileSync(path.join(repoRoot, "backend", ".gitignore"), "utf8");
  const frontendIgnore = fs.readFileSync(path.join(repoRoot, "frontend", ".gitignore"), "utf8");
  assert.match(backendIgnore, /^\.env$/m, "backend/.gitignore must ignore .env");
  assert.match(frontendIgnore, /^\.env\*$/m, "frontend/.gitignore must ignore .env*");
});

test("no environment file has ever been committed", () => {
  const history = git("log", "--all", "--oneline", "--", "backend/.env", "frontend/.env", "frontend/.env.local");
  assert.equal(history, "", `environment files appear in history:\n${history}`);
});

test("the ignore rules really win over git add", () => {
  // `git check-ignore` спрашивает у самого git, а не у наших ожиданий.
  for (const file of ["backend/.env", "frontend/.env", "frontend/.env.local"]) {
    const ignored = execFileSync("git", ["check-ignore", file], { cwd: repoRoot, encoding: "utf8" }).trim();
    assert.equal(ignored, file);
  }
});
