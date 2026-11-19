"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

/**
 * Every shell script in the repository must parse.
 *
 * Two of the ten concurrency scenarios were syntactically broken and nobody knew:
 * `pinterest-oauth-concurrency.sh` and `pinterest-publication-concurrency.sh` each
 * had a line truncated mid-command (the closing `")"` of a `$(psql -c "...")` was
 * missing), so bash reported "syntax error near unexpected token `done'" and the
 * scenario never ran. They were only discovered when the suite was finally
 * executed against a database.
 *
 * `bash -n` catches that class in milliseconds and needs no database. The check is
 * skipped with an explicit message when bash is unavailable, so it never turns a
 * missing tool into a false failure.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const SEARCH_DIRS = ["backend/test", "backend/test/lib", "scripts"];

function findBash() {
  const candidates = ["bash", "/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash"];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0 && /GNU bash/i.test(probe.stdout || "")) return candidate;
  }
  return null;
}

function collectShellScripts(directory, collected = []) {
  if (!fs.existsSync(directory)) return collected;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      collectShellScripts(full, collected);
    } else if (entry.name.endsWith(".sh")) {
      collected.push(full);
    }
  }
  return collected;
}

const bash = findBash();
const shellScripts = SEARCH_DIRS.flatMap((dir) => collectShellScripts(path.join(ROOT, dir)));

test("the shell corpus is large enough for this check to mean something", () => {
  assert.ok(shellScripts.length >= 15, `expected the shell scripts, found ${shellScripts.length}`);
});

test("every shell script parses with bash -n", { skip: bash ? false : "bash is not available here" }, () => {
  const failures = [];
  for (const script of shellScripts) {
    const result = spawnSync(bash, ["-n", script], { encoding: "utf8" });
    if (result.status !== 0) {
      const detail = `${result.stderr || result.stdout || ""}`.trim().split("\n")[0];
      failures.push(`${path.relative(ROOT, script)}: ${detail}`);
    }
  }
  assert.deepEqual(failures, [], `shell scripts that do not parse:\n${failures.join("\n")}`);
});
