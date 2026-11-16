"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeInboxLimit,
  normalizeImapUid,
  normalizeSupportReply,
} = require("../mailInputValidation");

test("mailbox pagination is bounded to 1..100 messages", () => {
  assert.equal(normalizeInboxLimit(undefined), 30);
  assert.equal(normalizeInboxLimit("25"), 25);
  assert.equal(normalizeInboxLimit(0), 1);
  assert.equal(normalizeInboxLimit(-10), 1);
  assert.equal(normalizeInboxLimit(10000), 100);
  assert.equal(normalizeInboxLimit("not-a-number"), 30);
});

test("IMAP message UIDs must be positive decimal integers", () => {
  assert.equal(normalizeImapUid("123"), "123");
  assert.equal(normalizeImapUid("0007"), "7");
  for (const value of ["", "0", "-1", "1:100", "1,2", "abc", "1.2", "9".repeat(13)]) {
    assert.throws(() => normalizeImapUid(value), { httpStatus: 422 });
  }
});

test("support replies validate recipient and bound subject/body", () => {
  assert.deepEqual(
    normalizeSupportReply(" Support@Example.com ", "Question", "  Hello  "),
    { to: "support@example.com", subject: "Question", text: "Hello" }
  );
  assert.throws(() => normalizeSupportReply("bad-address", "Question", "Hello"), { httpStatus: 422 });
  assert.throws(() => normalizeSupportReply("user@example.com", "Subject\r\nBcc: x@y.com", "Hello"), { httpStatus: 422 });
  assert.throws(() => normalizeSupportReply("user@example.com", "x".repeat(201), "Hello"), { httpStatus: 422 });
  assert.throws(() => normalizeSupportReply("user@example.com", "Question", "x".repeat(20001)), { httpStatus: 422 });
});
