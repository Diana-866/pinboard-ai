require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  requestId,
  actionId,
  validateBodyFields,
  evidence,
  mapRpcError,
} = require("../adminProviderRefundActions");

// These validators guard money movement: an accepted request id or evidence
// reference ends up in a provider refund. They had no tests.

test("requestId accepts positive integers and canonical digit strings", () => {
  assert.equal(requestId(42), "42");
  assert.equal(requestId(" 7 "), "7");
  assert.equal(requestId("9223372036854775807"), "9223372036854775807");
  // Leading zeros are rejected on purpose: the id must survive a round trip
  // to the provider byte for byte, so only the canonical form is accepted.
  assert.throws(() => requestId("000000000000000042"), /идентификатор операции/i);
});

test("requestId refuses zero, negatives, floats, non-digits and overflow", () => {
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2, "", "0", "-4", "1e5", "12a", "9223372036854775808", null, {}, undefined]) {
    assert.throws(() => requestId(value), /идентификатор операции/i, `accepted ${String(value)}`);
  }
});

test("actionId requires a canonical lowercase-able UUID", () => {
  const uuid = "8f14e45f-eaaf-4c1b-9c3e-2b0a9d5f7a11";
  assert.equal(actionId(uuid.toUpperCase()), uuid);
  for (const value of ["", "not-a-uuid", "8f14e45f-eaaf-4c1b-9c3e", 42, null]) {
    assert.throws(() => actionId(value), /идентификатор действия/i);
  }
});

test("validateBodyFields rejects unknown fields instead of ignoring them", () => {
  assert.doesNotThrow(() => validateBodyFields({ a: 1 }, ["a", "b"]));
  assert.throws(() => validateBodyFields({ a: 1, evil: 2 }, ["a"]), /неподдерживаемые поля/);
  assert.throws(() => validateBodyFields(null, ["a"]), /Некорректный формат/);
  assert.throws(() => validateBodyFields([], ["a"]), /Некорректный формат/);
});

test("evidence accepts a documented reference and refuses URLs or junk", () => {
  const ok = evidence({ evidence_type: "provider_dashboard", evidence_reference: "  REF-12345678 " });
  assert.deepEqual(ok, { evidenceType: "provider_dashboard", evidenceReference: "REF-12345678" });

  for (const body of [
    { evidence_type: "unknown_type", evidence_reference: "REF-12345678" },
    { evidence_type: "manual_review", evidence_reference: "short" },
    { evidence_type: "manual_review", evidence_reference: "https://evil.example/x" },
    { evidence_type: "manual_review", evidence_reference: "www.example.com/ticket" },
    { evidence_type: "manual_review", evidence_reference: " javascript:alert(1)" },
    { evidence_type: "manual_review" },
  ]) {
    assert.throws(() => evidence(body), /подтверждени/i, JSON.stringify(body));
  }
});

test("provider errors map to the right HTTP status instead of a generic 500", () => {
  assert.equal(mapRpcError({ message: "administrator privileges required" }).httpStatus, 403);
  assert.equal(mapRpcError({ message: "target request not found" }).httpStatus, 404);
  assert.equal(mapRpcError({ message: "invalid finalization action payload" }).httpStatus, 422);
  assert.equal(mapRpcError({ message: "all generation tasks must be failed" }).httpStatus, 409);
  assert.equal(mapRpcError({ message: "action id replay payload mismatch" }).httpStatus, 409);
  assert.equal(mapRpcError({}).httpStatus, 500);
  assert.equal(mapRpcError(null).httpStatus, 500);
});
