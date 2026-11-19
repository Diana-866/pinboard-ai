"use strict";

/**
 * Static check for PL/pgSQL fixtures: every `v_...` variable a SQL file uses must
 * be declared somewhere in that file.
 *
 * This exists because the SQL integration files can only be verified by running
 * them, and a typo like `v_board_id` instead of `v_board` in an edit is invisible
 * until psql reaches that line — which costs a full schema replay and a database
 * password. The check is deliberately file-scoped rather than block-scoped:
 * nested dollar-quoted bodies make per-block attribution unreliable, and a
 * file-scoped union has no false positives on the current corpus.
 */

const DECLARATION = new RegExp(
  "^\\s*([A-Za-z_][A-Za-z0-9_]*)\\s+(?:" +
  [
    "uuid",
    "text",
    "integer",
    "bigint",
    "int",
    "smallint",
    "numeric",
    "boolean",
    "timestamptz",
    "timestamp",
    "date",
    "interval",
    "json",
    "jsonb",
    "record",
    "bytea",
    "public\\.[a-z0-9_]+\\s*%rowtype",
  ].join("|") +
  ")\\b",
  "gmi"
);

const USAGE = /\b(v_[a-z0-9_]+)\b/gi;

function findUndeclaredVariables(source) {
  const declared = new Set();
  for (const match of source.matchAll(DECLARATION)) {
    declared.add(match[1].toLowerCase());
  }
  const undeclared = new Set();
  for (const match of source.matchAll(USAGE)) {
    const name = match[1].toLowerCase();
    if (!declared.has(name)) undeclared.add(match[1]);
  }
  return [...undeclared];
}

module.exports = { findUndeclaredVariables };
