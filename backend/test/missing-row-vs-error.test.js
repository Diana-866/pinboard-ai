"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { isMissingRow } = require("../dbErrors");

/**
 * `if (error || !row)` reads a database outage as an absence. Section 72 fixed three places, 73 fixed
 * two more, and five still remained: two project reads, board generation, board creation and the
 * tariff self-select guard - where the price was not "project deleted" but "you have no permission".
 *
 * The helper is tested directly and the entrypoint is then scanned, because one test per call site is
 * exactly how this pattern came back twice already.
 */

test("only PostgREST's zero-row code counts as a missing row", () => {
  assert.equal(isMissingRow({ code: "PGRST116" }), true, "zero rows from .single()");
  assert.equal(isMissingRow({ code: "PGRST116", message: "JSON object requested" }), true);
  assert.equal(isMissingRow({ status: "PGRST116" }), true, "some clients expose the code as status");

  for (const error of [
    null,
    undefined,
    {},
    { code: "XX000" },
    { code: "57014" },
    { code: "08006" },
    { code: "PGRST000" },
    { message: "connection refused" },
  ]) {
    assert.equal(isMissingRow(error), false, `${JSON.stringify(error)} must not be read as a missing row`);
  }
});

test("no route in the entrypoint turns a failed query into a not-found answer", () => {
  const source = readFileSync(resolve(process.cwd(), "index.js"), "utf8").replace(/\r\n/g, "\n");

  // Find every place that throws a not-found error and look back for the condition that guards it.
  const offenders = [];
  const notFound = /notFoundError\(/g;
  let match;
  while ((match = notFound.exec(source)) !== null) {
    const windowStart = Math.max(0, match.index - 400);
    const window = source.slice(windowStart, match.index);
    // `if (somethingError || !row)`, `if (fetchError || !project)`, `if (adminLookupError || !me)`
    if (/if\s*\([^)]*[Ee]rror\s*\|\|\s*!/.test(window)) {
      const line = source.slice(0, match.index).split("\n").length;
      offenders.push(`line ${line}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `a failed query must be a 5xx, not "not found": ${offenders.join(", ")}. Use isMissingRow(error) to separate zero rows from an outage.`
  );
});

test("the guard has teeth: the shape it forbids is the shape it finds", () => {
  // Sanity check of the scanner itself, so a passing suite cannot mean "the regex stopped matching".
  const sample = [
    "const { data, error } = await supabase.from('x').select('*').single();",
    'if (error || !data) throw notFoundError("x_not_found", "Нет");',
  ].join("\n");
  const window = sample.slice(0, sample.indexOf("notFoundError("));
  assert.match(window, /if\s*\([^)]*[Ee]rror\s*\|\|\s*!/, "the scanner must recognise the forbidden shape");
  assert.equal(
    /if\s*\([^)]*[Ee]rror\s*\|\|\s*!/.test("if (!row) throw notFoundError("),
    false,
    "a plain missing-row check must not be flagged"
  );
  assert.equal(
    /if\s*\([^)]*[Ee]rror\s*\|\|\s*!/.test('if (error && !isMissingRow(error)) throw httpError(503, "x")'),
    false,
    "the accepted form must not be flagged"
  );
});
