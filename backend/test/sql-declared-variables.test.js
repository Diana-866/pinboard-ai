"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { findUndeclaredVariables } = require("../../scripts/lib/sql-plpgsql-vars.cjs");

/**
 * The SQL integration files are only verified by running them against a
 * database, so a mistyped variable name survives review and fails at the end of a
 * full schema replay. This check is static: for each file, every `v_...` name it
 * uses must be declared in it.
 *
 * It would have caught the real mistake made while repairing the failed fixtures:
 * `v_board_id` was written in a file that declares `v_board`.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const SQL_DIR = path.join(ROOT, "backend", "test");

test("the check flags a variable that is used but never declared", () => {
  const source = `
do $$
declare
  v_board uuid;
  v_schedule uuid;
begin
  insert into public.pins(board_id) values (v_board_id);
  perform public.retry(v_schedule);
end;
$$;
`;
  assert.deepEqual(findUndeclaredVariables(source), ["v_board_id"]);
});

test("the check accepts declared scalars, rowtype records and multi-word types", () => {
  const source = `
do $$ declare
  v_user uuid;
  v_count integer;
  v_balance bigint;
  v_at timestamptz;
  v_payload jsonb;
  v_sub public.subscriptions%rowtype;
  v_flag boolean := false;
begin
  select count(*) into v_count from public.users where id = v_user;
  select tariff_plan into v_sub from public.subscriptions;
  v_balance := 0;
  v_at := clock_timestamp();
  v_payload := '{}'::jsonb;
  v_flag := true;
end; $$;
`;
  assert.deepEqual(findUndeclaredVariables(source), []);
});

test("every SQL file in backend/test declares the variables it uses", () => {
  const files = fs.readdirSync(SQL_DIR).filter((file) => file.endsWith(".sql"));
  assert.ok(files.length >= 50, `expected the SQL corpus, found ${files.length} files`);

  const failures = [];
  for (const file of files) {
    const undeclared = findUndeclaredVariables(fs.readFileSync(path.join(SQL_DIR, file), "utf8"));
    for (const name of undeclared) failures.push(`${file}: ${name}`);
  }

  assert.deepEqual(failures, [], `used but never declared:\n${failures.join("\n")}`);
});
