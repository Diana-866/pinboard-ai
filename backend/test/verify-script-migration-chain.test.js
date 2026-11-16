"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const scriptsDirectory = path.join(__dirname, "..", "..", "scripts");
const script = fs.readFileSync(path.join(scriptsDirectory, "verify.sh"), "utf8");
const windowsScript = fs.readFileSync(path.join(scriptsDirectory, "verify.ps1"), "utf8");

test("scratch database name is unique per process", () => {
  assert.match(script, /local db="pinposy_verify_\$\$"/);
});

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

test("Windows verification exposes an explicit PostgreSQL replay option", () => {
  assert.match(windowsScript, /\[switch\]\$Migrations/);
  assert.match(windowsScript, /\[switch\]\$MigrationsOnly/);
  assert.match(windowsScript, /if \(\$Migrations -or \$MigrationsOnly\)/);
});

test("Windows migrations-only mode does not require Node.js or npm", () => {
  assert.match(windowsScript, /if \(-not \$MigrationsOnly\) \{/);
  assert.match(windowsScript, /if \(-not \$MigrationsOnly\) \{[\s\S]*Get-Command node/);
  assert.match(windowsScript, /if \(-not \$MigrationsOnly\) \{[\s\S]*Get-Command npm\.cmd/);
});

test("Windows replay uses a uniquely named disposable database", () => {
  assert.match(windowsScript, /pinposy_verify_\$PID\$\(\[guid\]::NewGuid\(\)/);
  assert.match(windowsScript, /CREATE DATABASE \$database/);
  assert.match(windowsScript, /DROP DATABASE IF EXISTS \$database/);
});

test("Windows replay applies stubs, canonical baseline, then exactly 139 active migrations", () => {
  assert.match(windowsScript, /db\/supabase-stub\.sql/);
  assert.match(windowsScript, /001_baseline\.sql/);
  assert.match(windowsScript, /-ge 10/);
  assert.match(windowsScript, /-ne 139/);
  assert.match(windowsScript, /foreach \(\$migration in \$activeMigrations\)/);
});

test("Windows replay always attempts cleanup after database creation", () => {
  assert.match(windowsScript, /finally \{[\s\S]*DROP DATABASE IF EXISTS \$database/);
});

test("verification fallback does not claim an unverified GitHub billing cause", () => {
  assert.doesNotMatch(script, /billing\/spending limit/);
  assert.match(script, /fail before their first step/);
});
