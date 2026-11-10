import test from "node:test";
import assert from "node:assert/strict";
import { buildPinterestPinUrl } from "./pinterestPinUrl";

test("builds a Pinterest URL for a numeric remote pin ID", () => {
  assert.equal(buildPinterestPinUrl("123456789"), "https://www.pinterest.com/pin/123456789/");
});

test("trims a numeric remote pin ID", () => {
  assert.equal(buildPinterestPinUrl(" 123456789 "), "https://www.pinterest.com/pin/123456789/");
});

test("does not create a URL when the remote pin ID is missing or malformed", () => {
  for (const value of [null, undefined, "", "abc", "123/other", "123?redirect=evil", "https://evil.example"]) {
    assert.equal(buildPinterestPinUrl(value), undefined);
  }
});
