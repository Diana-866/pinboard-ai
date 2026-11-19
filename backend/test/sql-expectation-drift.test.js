"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * The SQL integration files only fail when they actually run against a database.
 * That makes a drifted error message expensive to discover: it costs a full
 * schema replay plus a database password. This check catches the static half of
 * that class instead.
 *
 * Two kinds of expectation are extracted from backend/test/*.sql:
 *
 *   1. Assertions on the message a function raises
 *      - `sqlerrm = 'x'` / `sqlerrm <> 'x'`  -> must match a raised message exactly
 *      - `position('x' in sqlerrm)`          -> must appear in a raised message
 *      A migration that rewords `raise exception` breaks these silently until run.
 *
 *   2. Assertions on the text of a function body
 *      - `position('x' in v_*_definition)`   -> must appear in the migration text
 *      These catch a migration that reformats a body the test inspects.
 *
 * The corpus is db/ (active migrations) plus db/archive (replayed history), since
 * an older migration may be the one that raises a message a later one preserves.
 */

const ROOT = path.resolve(__dirname, "..", "..");

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

function readSqlFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...readSqlFiles(full));
    } else if (entry.name.endsWith(".sql")) {
      files.push(full);
    }
  }
  return files;
}

const migrationFiles = [
  ...readSqlFiles(path.join(ROOT, "db", "migrations")),
  ...readSqlFiles(path.join(ROOT, "db", "archive")),
];
const migrationText = normalize(migrationFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n"));
const migrationTextLower = migrationText.toLowerCase();

const testFiles = readSqlFiles(path.join(ROOT, "backend", "test"));

function collect(pattern, group = 1) {
  const found = [];
  for (const file of testFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(pattern)) {
      const value = match[group];
      // A test that raises its own sentinel exception and then compares
      // sqlerrm against it is asserting its own text, not a migration message.
      const sentinel = new RegExp(`raise exception '${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`);
      if (sentinel.test(source)) continue;
      found.push({ file: path.relative(ROOT, file), value });
    }
  }
  return found;
}

test("the migration corpus is the one these checks assume", () => {
  assert.ok(migrationFiles.length >= 160, `expected the full migration history, found ${migrationFiles.length}`);
  assert.ok(testFiles.length >= 50, `expected the SQL test corpus, found ${testFiles.length}`);
});

test("every message the SQL tests assert on still exists in a migration", () => {
  const exact = [
    ...collect(/\bsqlerrm\s*(?:=|<>)\s*'((?:[^']|'')+)'/g),
    ...collect(/position\(\s*'((?:[^']|'')+)'\s+in\s+(?:upper\(|lower\()?sqlerrm/gi),
  ];
  assert.ok(exact.length >= 4, `expected message assertions in the SQL corpus, found ${exact.length}`);

  const missing = [];
  for (const { file, value } of exact) {
    const needle = normalize(value.replace(/''/g, "'"));
    if (!migrationText.includes(needle) && !migrationTextLower.includes(needle.toLowerCase())) {
      missing.push(`${file}: '${value}'`);
    }
  }
  assert.deepEqual(missing, [], `messages asserted by SQL tests but absent from migrations:\n${missing.join("\n")}`);
});

test("every function-body fragment the SQL tests inspect still exists", () => {
  const fragments = collect(/position\(\s*'((?:[^']|'')+)'\s+in\s+(?:lower\()?v_[a-z0-9_]*definition/gi);
  assert.ok(fragments.length >= 1, "expected function-body assertions in the SQL corpus");

  const missing = [];
  for (const { file, value } of fragments) {
    const needle = normalize(value.replace(/''/g, "'")).toLowerCase();
    if (!migrationTextLower.includes(needle)) {
      missing.push(`${file}: '${value}'`);
    }
  }
  assert.deepEqual(missing, [], `function bodies no longer contain what the SQL tests require:\n${missing.join("\n")}`);
});

test("a blocked pin deletion accepts the RESTRICT violation it actually raises", () => {
  // Migration 087 re-created pin_schedules_pin_id_fkey as ON DELETE RESTRICT so a
  // pin can never be cascade-deleted while a schedule references it. PostgreSQL
  // raises 23001 (restrict_violation) for RESTRICT, not 23503 (foreign_key_violation),
  // so a handler that only names the latter lets the error escape and fails the file.
  // This happened for real: pinterest-account-publication.integration.sql passed
  // review and only failed on a database at its 774th line.
  const offenders = [];
  let guarded = 0;
  for (const file of testFiles) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(ROOT, file);
    for (const match of source.matchAll(/begin([\s\S]*?)exception\s+when\s+([^\n]*?)\s+then/gi)) {
      const body = match[1];
      const condition = match[2];
      if (!/delete\s+from\s+public\.pins\b/i.test(body)) continue;
      guarded += 1;
      // Only handlers that rely on foreign_key_violation are the defect; a block
      // guarding a different error (for example the 55000 lifecycle guard) is not.
      if (/foreign_key_violation/i.test(condition) && !/restrict_violation/i.test(condition)) {
        offenders.push(`${relative}: '${condition}' must also catch restrict_violation`);
      }
    }
  }
  assert.ok(guarded >= 3, `expected the guarded pin-deletion fixtures, found ${guarded}`);
  assert.deepEqual(offenders, [], `pin deletion guarded with the wrong SQLSTATE:\n${offenders.join("\n")}`);
});
