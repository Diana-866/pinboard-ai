import test from "node:test";
import assert from "node:assert/strict";
import { isAmbiguousPinterestPublishStatus } from "./pinterestPublishOutcome";

test("fences publish retries when the remote outcome may be unknown", () => {
  for (const status of [0, 409, 500, 502, 503, 504]) {
    assert.equal(isAmbiguousPinterestPublishStatus(status), true);
  }
});

test("keeps definite client validation errors actionable", () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(isAmbiguousPinterestPublishStatus(status), false);
  }
});
