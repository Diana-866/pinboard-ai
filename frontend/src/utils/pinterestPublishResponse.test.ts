import test from "node:test";
import assert from "node:assert/strict";
import { readConfirmedPinterestPublish } from "./pinterestPublishResponse";

test("accepts only an explicit success for the exact selected Pinterest board", () => {
  assert.deepEqual(
    readConfirmedPinterestPublish({ ok: true, pinterest_pin_id: "123456789", board_id: "board-1" }, "board-1"),
    { pinId: "123456789", boardId: "board-1" },
  );
});

test("rejects incomplete, malformed, or wrong-board success responses", () => {
  const invalid = [
    null,
    {},
    { ok: true, board_id: "board-1" },
    { ok: true, pinterest_pin_id: "not-a-pin-id", board_id: "board-1" },
    { ok: true, pinterest_pin_id: "123456789", board_id: "board-2" },
    { ok: false, pinterest_pin_id: "123456789", board_id: "board-1" },
  ];
  for (const response of invalid) {
    assert.equal(readConfirmedPinterestPublish(response, "board-1"), null);
  }
});
