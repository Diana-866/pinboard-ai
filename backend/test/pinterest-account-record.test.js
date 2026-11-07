const test = require("node:test");
const assert = require("node:assert/strict");
const { decodePinterestAccountRecord } = require("../pinterestAccountRecord");

function makeSupabase({ returnedRow = null, error = null } = {}) {
  const calls = [];
  const builder = {
    update(value) { calls.push(["update", value]); return this; },
    eq(column, value) { calls.push(["eq", column, value]); return this; },
    select(value) { calls.push(["select", value]); return this; },
    async maybeSingle() { return { data: returnedRow, error }; },
  };
  return {
    calls,
    from(table) { calls.push(["from", table]); return builder; },
  };
}

const baseRow = {
  id: "account-1",
  user_id: "user-1",
  access_token: "old-access-ciphertext",
  refresh_token: "old-refresh-ciphertext",
  refresh_state: "ready",
  updated_at: "2026-11-07T10:00:00.000Z",
};

function cryptoDependencies(overrides = {}) {
  return {
    hasEncryptionKey: () => true,
    isEncryptedToken: (value) => String(value || "").startsWith("enc:"),
    isEncryptedWithActiveKey: (value) => String(value || "").startsWith("enc:active:"),
    decryptToken: (value) => value == null ? null : (
      String(value).startsWith("enc:") ? String(value).split(":").at(-1) : value
    ),
    encryptToken: (value) => `enc:active:${value}`,
    now: () => "2026-11-07T11:00:00.000Z",
    ...overrides,
  };
}

test("lazy key rotation uses an optimistic row-version fence", async () => {
  const supabase = makeSupabase();
  const result = await decodePinterestAccountRecord(baseRow, {
    supabase,
    ...cryptoDependencies(),
  });

  assert.equal(result.access_token, "old-access-ciphertext");
  assert.equal(result.refresh_token, "old-refresh-ciphertext");
  assert.deepEqual(supabase.calls, [
    ["from", "pinterest_accounts"],
    ["update", {
      access_token: "enc:active:old-access-ciphertext",
      refresh_token: "enc:active:old-refresh-ciphertext",
      updated_at: "2026-11-07T11:00:00.000Z",
    }],
    ["eq", "id", "account-1"],
    ["eq", "user_id", "user-1"],
    ["eq", "updated_at", "2026-11-07T10:00:00.000Z"],
    ["select", "*"],
  ]);
});

test("a lost optimistic race does not perform a blind write or return uncommitted ciphertext", async () => {
  // maybeSingle() returns no row when another writer changed updated_at or
  // refresh_state before our compare-and-swap update reached PostgreSQL.
  const supabase = makeSupabase({ returnedRow: null });
  const result = await decodePinterestAccountRecord(baseRow, {
    supabase,
    ...cryptoDependencies(),
  });

  assert.equal(result.access_token, "old-access-ciphertext");
  assert.equal(result.refresh_token, "old-refresh-ciphertext");
  assert.equal(supabase.calls.filter(([name]) => name === "update").length, 1);
  assert.ok(supabase.calls.some((call) =>
    call[0] === "eq" && call[1] === "updated_at" && call[2] === baseRow.updated_at
  ));
});

test("uncertain refresh rows are never touched by lazy encryption migration", async () => {
  const supabase = makeSupabase();
  const result = await decodePinterestAccountRecord({
    ...baseRow,
    refresh_state: "uncertain",
  }, {
    supabase,
    ...cryptoDependencies(),
  });

  assert.equal(result.access_token, "old-access-ciphertext");
  assert.deepEqual(supabase.calls, []);
});

test("already active-key ciphertext does not cause a database write", async () => {
  const supabase = makeSupabase();
  const result = await decodePinterestAccountRecord({
    ...baseRow,
    access_token: "enc:active:access-secret",
    refresh_token: "enc:active:refresh-secret",
  }, {
    supabase,
    ...cryptoDependencies(),
  });

  assert.equal(result.access_token, "access-secret");
  assert.equal(result.refresh_token, "refresh-secret");
  assert.deepEqual(supabase.calls, []);
});

test("database errors during lazy migration fail closed", async () => {
  const supabase = makeSupabase({ error: new Error("database unavailable") });
  await assert.rejects(
    decodePinterestAccountRecord(baseRow, {
      supabase,
      ...cryptoDependencies(),
    }),
    /database unavailable/
  );
});
