"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Section 122. The documentation tells the owner to do numbered things (UA-0xx), and the sections of
 * this session cite them by number: "apply migrations 164 and 165 - your action, UA-0xx". A wrong
 * number is not a typo the reader can notice: it sends them to a different instruction and they cannot
 * tell that the reference was wrong. I made exactly that mistake in section 121, citing UA-068 (the
 * account-deletion queue) for the migration work, which is UA-070.
 */
const ROOT = path.join(__dirname, "..", "..");
const DOCS = path.join(ROOT, "docs");
const USER_ACTIONS = path.join(DOCS, "USER_ACTIONS.md");

function docFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...docFiles(full));
    else if (entry.name.endsWith(".md")) found.push(full);
  }
  return found;
}

function headings(file) {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return [...text.matchAll(/^#{2,4}\s+(UA-\d{3})\s+—/gm)].map((match) => match[1]);
}

function references(files) {
  const seen = new Map();
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    for (const match of text.matchAll(/\bUA-\d{3}\b/g)) {
      const list = seen.get(match[0]) || [];
      list.push(path.relative(ROOT, file));
      seen.set(match[0], list);
    }
  }
  return seen;
}

test("every owner action the documentation cites really exists", () => {
  const defined = new Set(headings(USER_ACTIONS));
  assert.ok(defined.size >= 20, `expected the owner-action list to be real, found ${defined.size} headings`);
  const cited = references(docFiles(DOCS));
  assert.ok(cited.size >= 10, `expected the docs to cite many owner actions, found ${cited.size}`);
  const dangling = [...cited.keys()].filter((id) => !defined.has(id));
  assert.deepEqual(dangling, [], `documentation cites actions that do not exist: ${dangling.join(", ")}`);
});

test("the scanner really sees a heading and a reference, so a green run means something", () => {
  const sample = "## UA-999 — synthetic\n\nSee UA-998 for the other thing.\n";
  assert.deepEqual(
    [...sample.matchAll(/^#{2,4}\s+(UA-\d{3})\s+—/gm)].map((m) => m[1]),
    ["UA-999"]
  );
  assert.deepEqual([...sample.matchAll(/\bUA-\d{3}\b/g)].map((m) => m[0]), ["UA-999", "UA-998"]);
});

test("the push instruction keeps a real count, not a placeholder", () => {
  const text = fs.readFileSync(USER_ACTIONS, "utf8").replace(/\r\n/g, "\n");
  const match = /#### UA-067 —[^\n]*?(\d+)\s+коммит/.exec(text);
  assert.ok(match, "UA-067 must state how many commits are waiting to be pushed");
  assert.ok(Number(match[1]) >= 1, "the count must be a real number of commits");
});
