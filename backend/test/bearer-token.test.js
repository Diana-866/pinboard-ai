const test = require("node:test");
const assert = require("node:assert/strict");
const { extractBearerToken } = require("../bearerToken");

test("extracts standard Bearer authorization credentials", () => {
  assert.equal(extractBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
});

test("accepts case-insensitive scheme and surrounding header whitespace", () => {
  assert.equal(extractBearerToken("  bearer   abc.def.ghi  "), "abc.def.ghi");
});

test("rejects missing, wrong-scheme, and malformed authorization headers", () => {
  for (const value of [undefined, "", "Basic abc", "Bearer", "Bearer token extra", "Bearer \\\\s token"]) {
    assert.equal(extractBearerToken(value), "");
  }
});
