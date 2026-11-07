const test = require("node:test");
const assert = require("node:assert/strict");
const { extractManagedPinImagePath, canDeletePinImageObject, buildPinImageObjectPath } = require("./pinImageLifecycle");

const base = "https://project.supabase.co";

test("extracts an owned pin object path from the configured public bucket", () => {
  assert.equal(
    extractManagedPinImagePath(
      "https://project.supabase.co/storage/v1/object/public/pin-images/pins/1730000000000-ab12cd34.webp",
      base
    ),
    "pins/1730000000000-ab12cd34.webp"
  );
});

test("rejects another host, bucket, or Supabase project", () => {
  assert.equal(extractManagedPinImagePath("https://evil.example/storage/v1/object/public/pin-images/pins/1730000000000-ab12cd34.webp", base), null);
  assert.equal(extractManagedPinImagePath("https://project.supabase.co/storage/v1/object/public/other/pins/1730000000000-ab12cd34.webp", base), null);
  assert.equal(extractManagedPinImagePath("https://other.supabase.co/storage/v1/object/public/pin-images/pins/1730000000000-ab12cd34.webp", base), null);
});

test("rejects paths outside the generated pin object naming scheme", () => {
  assert.equal(extractManagedPinImagePath("https://project.supabase.co/storage/v1/object/public/pin-images/avatars/user.png", base), null);
  assert.equal(extractManagedPinImagePath("https://project.supabase.co/storage/v1/object/public/pin-images/pins/../../secrets.png", base), null);
  assert.equal(extractManagedPinImagePath("https://project.supabase.co/storage/v1/object/public/pin-images/pins/1730000000000-ab12cd34.svg", base), null);
});


test("image cleanup is blocked while any pin or schedule references the object", () => {
  assert.equal(canDeletePinImageObject({ hasPinReference: true, hasScheduleReference: false }), false);
  assert.equal(canDeletePinImageObject({ hasPinReference: false, hasScheduleReference: true }), false);
});

test("image cleanup waits for active or uncertain generation requests", () => {
  assert.equal(canDeletePinImageObject({ hasPinReference: false, hasScheduleReference: false, generationRequestStatuses: ["processing"] }), false);
  assert.equal(canDeletePinImageObject({ hasPinReference: false, hasScheduleReference: false, generationRequestStatuses: ["unknown"] }), false);
});

test("image cleanup permits only terminal generation journal references", () => {
  assert.equal(canDeletePinImageObject({ hasPinReference: false, hasScheduleReference: false, generationRequestStatuses: ["completed", "failed"] }), true);
});


test("generation upload object keys are deterministic for the same provider idempotency key", () => {
  const first = buildPinImageObjectPath("webp", "provider-task-key-123");
  const retry = buildPinImageObjectPath("webp", "provider-task-key-123");
  const other = buildPinImageObjectPath("webp", "provider-task-key-456");
  assert.equal(first, retry);
  assert.notEqual(first, other);
  assert.match(first, /^pins\/generation-[a-f0-9]{32}\.webp$/);
});

test("deterministic generation object paths are recognized as managed", () => {
  const path = buildPinImageObjectPath("png", "provider-task-key");
  assert.equal(
    extractManagedPinImagePath(`https://project.supabase.co/storage/v1/object/public/pin-images/${path}`, base),
    path
  );
});
