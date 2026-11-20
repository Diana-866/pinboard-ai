"use strict";

require("./helpers/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BACKEND = path.resolve(__dirname, "..");

/**
 * supabase-js query builders (`supabase.from(...)`, `supabase.rpc(...)`) are thenables with `then` only -
 * `PostgrestBuilder` in @supabase/postgrest-js 2.116.0 defines no `catch`. Writing
 * `supabase.rpc(...).catch(...)` therefore throws a TypeError at the exact moment the code tries to record
 * a failure, inside a request's own catch block; the throw becomes an unhandled rejection and the fatal
 * handlers turn it into process.exit(1). One failed pin regeneration used to take the whole backend down.
 *
 * This guard reads every backend module and fails if a builder chain ends in `.catch(`. Use settleQuery().
 */

/** Blank out comments (keeping line numbers) so prose about the bug is not mistaken for the bug. */
function stripComments(source) {
  const NEWLINE = String.fromCharCode(10);
  let out = "";
  let index = 0;
  let quote = null;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (quote) {
      out += character;
      if (character === "\\") {
        out += next === undefined ? "" : next;
        index += 2;
        continue;
      }
      if (character === quote) quote = null;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      out += character;
      index += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      while (index < source.length && source[index] !== NEWLINE) {
        out += " ";
        index += 1;
      }
      continue;
    }
    if (character === "/" && next === "*") {
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        out += source[index] === NEWLINE ? NEWLINE : " ";
        index += 1;
      }
      out += "  ";
      index += 2;
      continue;
    }
    out += character;
    index += 1;
  }
  return out;
}

/** Index just past the bracket that closes the one opened at `openIndex`. */
function afterClosingBracket(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return source.length;
}

/**
 * Every `supabase.rpc(...)` / `supabase.from(...)` call followed by whatever chain is attached to it.
 * `.catch(` on that chain is the defect; `.catch(` inside an argument of another call in the same
 * statement is not.
 */
function scanBuilderChains(rawSource) {
  const source = stripComments(rawSource.replace(/\r\n/g, "\n"));
  const findings = [];
  let scanned = 0;
  const startPattern = /supabase\s*\.\s*(?:rpc|from)\s*\(/g;
  let match;
  while ((match = startPattern.exec(source))) {
    scanned += 1;
    const openParen = match.index + match[0].length - 1;
    let cursor = afterClosingBracket(source, openParen);
    let sawCatch = false;
    for (;;) {
      let probe = cursor;
      while (probe < source.length && /\s/.test(source[probe])) probe += 1;
      if (source[probe] !== ".") break;
      const nameMatch = /^\.\s*([A-Za-z_$][\w$]*)/.exec(source.slice(probe, probe + 40));
      if (!nameMatch) break;
      const name = nameMatch[1];
      probe += nameMatch[0].length;
      while (probe < source.length && /\s/.test(source[probe])) probe += 1;
      if (source[probe] === "(") probe = afterClosingBracket(source, probe);
      if (name === "catch") sawCatch = true;
      cursor = probe;
    }
    if (sawCatch) {
      const line = source.slice(0, match.index).split("\n").length;
      findings.push({ line, chain: source.slice(match.index, cursor).replace(/\s+/g, " ").slice(0, 90) });
    }
  }
  return { findings, scanned };
}

function backendModules() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "test" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) files.push(full);
    }
  };
  walk(BACKEND);
  return files;
}

test("no backend module calls .catch on a supabase query builder", () => {
  const files = backendModules();
  assert.ok(files.length > 40, `expected to scan the backend modules, found ${files.length} files`);
  const problems = [];
  let scannedChains = 0;
  for (const file of files) {
    const { findings, scanned } = scanBuilderChains(fs.readFileSync(file, "utf8"));
    scannedChains += scanned;
    for (const finding of findings) {
      problems.push(`${path.relative(BACKEND, file)}:${finding.line} ${finding.chain}`);
    }
  }
  assert.deepEqual(problems, [], "use settleQuery(builder, handler) instead of .catch on a builder");
  // A vacuous guard would scan nothing; the codebase builds hundreds of queries.
  assert.ok(scannedChains > 100, `expected many builder chains, scanned only ${scannedChains}`);
});

test("the scanner recognises the forbidden shape and tolerates the safe one", () => {
  const bad = 'await supabase.rpc("x", { a: 1 }).catch(() => logError("e"));\n';
  assert.equal(scanBuilderChains(bad).findings.length, 1);

  const badMultiline = 'const p = supabase\n  .from("pins")\n  .select("*")\n  .catch(() => {});\n';
  assert.equal(scanBuilderChains(badMultiline).findings.length, 1);

  const good = 'await settleQuery(supabase.rpc("x", { a: 1 }), () => logError("e"));\n';
  assert.deepEqual(scanBuilderChains(good).findings, []);

  // A catch in the next statement does not taint the builder's own statement.
  const separated = 'const q = supabase.rpc("x");\nq.catch(() => {});\n';
  assert.deepEqual(scanBuilderChains(separated).findings, []);

  // A catch inside the handler argument of the same statement is legitimate (a real promise).
  const nested = 'await settleQuery(supabase.rpc("x"), () => other().catch(() => {}));\n';
  assert.deepEqual(scanBuilderChains(nested).findings, []);

  // Prose about the defect must not be reported as the defect.
  const commented = '// never write supabase.rpc("x").catch(...)\n/* nor supabase.from("t").catch(f) */\n';
  assert.deepEqual(scanBuilderChains(commented).findings, []);
});
