"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Every SQL file in the repository must have balanced dollar-quoted strings.
 *
 * A single dropped `$` turns a whole file into an unterminated string and psql
 * rejects it at the end of the file, far away from the edit that caused it. That
 * exact defect shipped once: commit 31882a97 rewrote the terminator of
 * backend/test/payment-provider-receipt-fulfillment.integration.sql from `$$;`
 * to `$;`, and nothing noticed for months because no run of the SQL suite had
 * ever been recorded. This check needs no database, so it fails in milliseconds.
 *
 * The lexer follows PostgreSQL's own rules:
 *   - inside `--` line comments and nestable block comments nothing is a
 *     delimiter;
 *   - inside '...' ('' escapes) and "..." ("" escapes) nothing is a delimiter;
 *   - once a dollar-quoted string `$tag$ ... $tag$` is open, the *only* thing that
 *     ends it is the identical tag, so `$f$` inside `$$ ... $$` is plain text.
 */

const { findUnbalancedDollarQuotes } = require("../../scripts/lib/sql-lexer.cjs");

const ROOT = path.resolve(__dirname, "..", "..");

function collectSqlFiles(directory, collected = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSqlFiles(full, collected);
    } else if (entry.name.endsWith(".sql")) {
      collected.push(full);
    }
  }
  return collected;
}

test("the lexer detects the dropped-dollar terminator that broke a real file", () => {
  // This is the exact shape of commit 31882a97's regression.
  const broken = "do $$\ndeclare v int;\nbegin\n  v := 1;\nend;\n$;\n\nrollback;\n";
  assert.deepEqual(findUnbalancedDollarQuotes(broken), ["unterminated $$ opened at line 1"]);

  // NB: `$$` in a replace() replacement string is an escape for a literal `$`,
  // so the repair must go through a function to keep both dollars.
  const repaired = broken.replace("\n$;\n", () => "\n$$;\n");
  assert.deepEqual(findUnbalancedDollarQuotes(repaired), []);
});

test("the lexer ignores delimiters inside comments, literals and nested tags", () => {
  assert.deepEqual(findUnbalancedDollarQuotes("-- $$ inside a comment\nselect 1;\n"), []);
  assert.deepEqual(findUnbalancedDollarQuotes("/* $$ /* nested */ still a comment */\nselect 1;\n"), []);
  assert.deepEqual(findUnbalancedDollarQuotes("select '$$ not a delimiter';\n"), []);
  assert.deepEqual(findUnbalancedDollarQuotes('select "$$" from t;\n'), []);
  // A different tag inside an open body is plain text, as in PostgreSQL.
  assert.deepEqual(findUnbalancedDollarQuotes("do $$ begin perform $f$ x $f$; end; $$;\n"), []);
  assert.deepEqual(findUnbalancedDollarQuotes("do $body$ begin end; $body$;\n"), []);
});

test("every SQL file in the repository has balanced dollar quotes", () => {
  const files = [
    ...collectSqlFiles(path.join(ROOT, "db")),
    ...collectSqlFiles(path.join(ROOT, "backend", "test")),
  ];

  assert.ok(files.length > 200, `expected the full SQL corpus, found ${files.length} files`);

  const failures = [];
  for (const file of files) {
    const problems = findUnbalancedDollarQuotes(fs.readFileSync(file, "utf8"));
    for (const problem of problems) {
      failures.push(`${path.relative(ROOT, file)}: ${problem}`);
    }
  }

  assert.deepEqual(failures, [], `unbalanced dollar quotes:\n${failures.join("\n")}`);
});
