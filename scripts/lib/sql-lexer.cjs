"use strict";

/**
 * Minimal PostgreSQL lexer used by the SQL static checks.
 *
 * A single dropped `$` turns a whole file into an unterminated dollar-quoted
 * string; psql then rejects the file at its end, far from the edit that caused
 * it. Detecting that needs no database, so both the test suite and
 * scripts/verify-sql-windows.ps1 use this module.
 *
 * The rules follow PostgreSQL's own lexer:
 *   - inside `--` line comments and nestable block comments nothing is a
 *     delimiter;
 *   - inside '...' ('' escapes) and "..." ("" escapes) nothing is a delimiter;
 *   - once `$tag$` is open, the only thing that closes it is the identical tag,
 *     so `$f$` inside `$$ ... $$` is plain text.
 */

function lineAt(source, position) {
  let line = 1;
  for (let index = 0; index < position; index += 1) {
    if (source[index] === "\n") line += 1;
  }
  return line;
}

const DOLLAR_TAG = /^\$([A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF]*)?\$/;

function findUnbalancedDollarQuotes(source) {
  const problems = [];
  let index = 0;
  let open = null;
  let openLine = 0;

  while (index < source.length) {
    if (open !== null) {
      if (source.startsWith(open, index)) {
        index += open.length;
        open = null;
        continue;
      }
      index += 1;
      continue;
    }

    const pair = source.slice(index, index + 2);
    if (pair === "--") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (pair === "/*") {
      index += 2;
      let depth = 1;
      while (index < source.length && depth > 0) {
        const inner = source.slice(index, index + 2);
        if (inner === "/*") { depth += 1; index += 2; continue; }
        if (inner === "*/") { depth -= 1; index += 2; continue; }
        index += 1;
      }
      continue;
    }
    if (source[index] === "'") {
      index += 1;
      while (index < source.length) {
        if (source[index] === "'" && source[index + 1] === "'") { index += 2; continue; }
        if (source[index] === "'") { index += 1; break; }
        index += 1;
      }
      continue;
    }
    if (source[index] === '"') {
      index += 1;
      while (index < source.length) {
        if (source[index] === '"' && source[index + 1] === '"') { index += 2; continue; }
        if (source[index] === '"') { index += 1; break; }
        index += 1;
      }
      continue;
    }
    if (source[index] === "$") {
      const match = DOLLAR_TAG.exec(source.slice(index));
      if (match) {
        open = match[0];
        openLine = lineAt(source, index);
        index += open.length;
        continue;
      }
    }
    index += 1;
  }

  if (open !== null) {
    problems.push(`unterminated ${open} opened at line ${openLine}`);
  }
  return problems;
}

module.exports = { findUnbalancedDollarQuotes };
