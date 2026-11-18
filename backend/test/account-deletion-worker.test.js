"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inspectAccountForDeletion,
  countOwnedRows,
  createAccountDeletionWorker,
  safeErrorCode,
} = require("../accountDeletionWorker");

const USER_ID = "11111111-1111-4111-8111-111111111111";

function createReadClient({ account = { id: USER_ID, account_status: "deletion_pending" }, failTable = null, nullTable = null } = {}) {
  return {
    supabaseUrl: "https://project.supabase.co",
    from(table) {
      const query = {
        filters: [],
        select() { return this; },
        eq(column, value) { this.filters.push([column, value]); return this; },
        in(column, value) { this.filters.push([column, value]); return this; },
        order(column, options) { this.orderArgs = [column, options]; return this; },
        range(start, end) { this.rangeArgs = [start, end]; return this; },
        maybeSingle() {
          return Promise.resolve({ data: table === "users" ? account : null, error: null });
        },
        then(resolve, reject) {
          if (table === nullTable) return Promise.resolve({ data: null, count: null, error: null }).then(resolve, reject);
          if (table === failTable) return Promise.resolve({ data: null, error: { code: "XX000" } }).then(resolve, reject);
          if (table === "projects") return Promise.resolve({ data: [{ id: "project-1" }], count: 1, error: null }).then(resolve, reject);
          if (table === "boards") return Promise.resolve({ data: [{ id: "board-1" }], count: 1, error: null }).then(resolve, reject);
          return Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test("preflight rejects malformed owner IDs before reading data", async () => {
  await assert.rejects(
    inspectAccountForDeletion(createReadClient(), "not-a-uuid"),
    (error) => error.code === "invalid_owner_id"
  );
});

test("preflight refuses an account that is not fenced for deletion", async () => {
  await assert.rejects(
    inspectAccountForDeletion(createReadClient({ account: { id: USER_ID, account_status: "active" } }), USER_ID),
    (error) => error.code === "account_state_mismatch"
  );
});

test("preflight inventories every exported user-owned section without loading row contents", async () => {
  const result = await inspectAccountForDeletion(createReadClient(), USER_ID);
  assert.equal(result.ok, true);
  assert.equal(result.sectionsChecked, 22);
  assert.equal(Object.keys(result.counts).length, result.sectionsChecked);
  assert.equal(result.counts.projects, 1);
  assert.equal(result.counts.boards, 1);
  assert.equal(result.counts.pins, 0);
});

test("preflight paginates project and board identifiers beyond the API row cap", async () => {
  const ranges = [];
  const client = {
    from(table) {
      const query = {
        filters: [],
        headOnly: false,
        rangeArgs: [0, 999],
        select(_columns, options) { this.headOnly = Boolean(options && options.head); return this; },
        eq(column, value) { this.filters.push([column, value]); return this; },
        in(column, value) { this.filters.push([column, value]); return this; },
        order(column, options) { this.orderArgs = [column, options]; ranges.push({ table, order: [column, options] }); return this; },
        range(start, end) { this.rangeArgs = [start, end]; ranges.push({ table, start, end }); return this; },
        maybeSingle() { return Promise.resolve({ data: { id: USER_ID, account_status: "deletion_pending" }, error: null }); },
        then(resolve, reject) {
          if (this.headOnly) return Promise.resolve({ data: null, count: 0, error: null }).then(resolve, reject);
          if (table === "projects" && this.rangeArgs[0] === 0) {
            return Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}` })), error: null }).then(resolve, reject);
          }
          if (table === "projects") return Promise.resolve({ data: [{ id: "p1000" }], error: null }).then(resolve, reject);
          if (table === "boards") {
            const projectFilter = this.filters.find(([column]) => column === "project_id");
            const boardCount = projectFilter ? projectFilter[1].length : 0;
            return Promise.resolve({
              data: Array.from({ length: boardCount }, (_, i) => ({ id: `b${this.rangeArgs[0]}-${i}` })),
              error: null,
            }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const result = await inspectAccountForDeletion(client, USER_ID);
  assert.equal(result.ok, true);
  assert.ok(ranges.some((r) => r.table === "projects" && r.start === 1000));
  assert.ok(ranges.filter((r) => r.order).every((r) => r.order[0] === "id" && r.order[1].ascending === true));
  assert.ok(ranges.some((r) => r.table === "subscriptions" && r.order));
  assert.ok(ranges.some((r) => r.table === "projects" && r.order));
  assert.ok(ranges.some((r) => r.table === "boards" && r.order));
  assert.ok(ranges.some((r) => r.table === "boards" && r.start === 1000));
  assert.equal(result.counts.boards, 1001);
});

test("preflight fails closed when a paginated inventory response is not an array", async () => {
  await assert.rejects(
    inspectAccountForDeletion(createReadClient({ nullTable: "projects" }), USER_ID),
    (error) => error.code === "invalid_inventory_page"
  );
});

test("preflight fails closed when a dependent table cannot be read", async () => {
  await assert.rejects(
    inspectAccountForDeletion(createReadClient({ failTable: "credit_transactions" }), USER_ID),
    (error) => error.code === "XX000"
  );
});

test("worker claims and finalizes only through fenced RPCs", async () => {
  const calls = [];
  const client = {
    ...createReadClient(),
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{ job_id: "job-1",
          request_id: "request-job-1",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z", user_id: USER_ID, claim_token: "claim-1" }], error: null };
      }
      if (name === "record_account_deletion_preflight") return { data: true, error: null };
      if (name === "materialize_account_deletion_storage_manifest") return { data: { recorded: true, inserted: 1, total: 1 }, error: null };
      if (name === "mark_account_deletion_storage_manifest") return { data: true, error: null };
      if (name === "disconnect_pinterest_for_account_deletion") return { data: 0, error: null };
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC");
    },
  };
  const worker = createAccountDeletionWorker({ client, logger: { info() {}, error() {} } });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 1, retried: 0 });
  assert.equal(calls[0].name, "claim_account_deletion_jobs");
  assert.deepEqual(calls[0].args, { p_limit: 1, p_lease_seconds: 900 });
  assert.equal(calls[1].name, "record_account_deletion_preflight");
  assert.equal(calls[1].args.p_claim_token, "claim-1");
  assert.equal(calls[2].name, "materialize_account_deletion_storage_manifest");
  assert.equal(calls[2].args.p_claim_token, "claim-1");
  assert.equal(calls[2].args.p_supabase_url, "https://project.supabase.co");
  assert.equal(calls[3].name, "mark_account_deletion_storage_manifest");
  assert.equal(calls[4].name, "disconnect_pinterest_for_account_deletion");
  assert.equal(calls[4].args.p_user_id, USER_ID);
  assert.equal(calls[5].name, "finish_account_deletion_job");
  assert.equal(calls[5].args.p_outcome, "succeeded");
});

test("worker never marks preflight complete after losing the inventory claim", async () => {
  const calls = [];
  const client = {
    ...createReadClient(),
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{ job_id: "job-lost",
          request_id: "request-job-lost",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z", user_id: USER_ID, claim_token: "claim-lost" }], error: null };
      }
      if (name === "record_account_deletion_preflight") return { data: false, error: null };
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC");
    },
  };
  const worker = createAccountDeletionWorker({ client, logger: { info() {}, error() {} } });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 0 });
  assert.equal(calls.some((call) => call.name === "finish_account_deletion_job"), false);
});

test("worker persists only a successful bounded inventory before finalizing", async () => {
  const calls = [];
  const client = {
    ...createReadClient(),
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{ job_id: "job-inventory",
          request_id: "request-job-inventory",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z", user_id: USER_ID, claim_token: "claim-inventory" }], error: null };
      }
      if (name === "record_account_deletion_preflight") return { data: true, error: null };
      if (name === "materialize_account_deletion_storage_manifest") return { data: { recorded: true, inserted: 1, total: 1 }, error: null };
      if (name === "mark_account_deletion_storage_manifest") return { data: true, error: null };
      if (name === "disconnect_pinterest_for_account_deletion") return { data: 0, error: null };
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC");
    },
  };
  const worker = createAccountDeletionWorker({ client, logger: { info() {}, error() {} } });
  await worker.tick();
  const inventoryCall = calls.find((call) => call.name === "record_account_deletion_preflight");
  assert.equal(inventoryCall.args.p_inventory.ok, true);
  assert.equal(inventoryCall.args.p_inventory.sectionsChecked, 22);
  assert.equal(Object.keys(inventoryCall.args.p_inventory.counts).length, 22);
  assert.equal(calls.some((call) => call.name === "disconnect_pinterest_for_account_deletion"), true);
  assert.equal(calls[calls.length - 1].name, "finish_account_deletion_job");
});

test("worker schedules retry when inventory is incomplete", async () => {
  const calls = [];
  const client = {
    ...createReadClient({ failTable: "credit_transactions" }),
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{ job_id: "job-2",
          request_id: "request-job-2",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z", user_id: USER_ID, claim_token: "claim-2" }], error: null };
      }
      if (name === "record_account_deletion_preflight") return { data: true, error: null };
      if (name === "materialize_account_deletion_storage_manifest") return { data: { recorded: true, inserted: 1, total: 1 }, error: null };
      if (name === "mark_account_deletion_storage_manifest") return { data: true, error: null };
      return { data: true, error: null };
    },
  };
  const worker = createAccountDeletionWorker({ client, logger: { info() {}, error() {} } });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 1 });
  assert.equal(calls[1].args.p_outcome, "retry");
  assert.equal(calls[1].args.p_error_code, "xx000");
});

test("worker error codes are normalized and bounded", () => {
  assert.equal(safeErrorCode({ code: "DB TIMEOUT" }), "db_timeout");
  assert.equal(safeErrorCode(null), "preflight_failed");
});

test("worker retries and does not revoke credentials when Storage manifest persistence fails", async () => {
  const calls = [];
  const client = {
    ...createReadClient(),
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{ job_id: "job-manifest-failed",
          request_id: "request-job-manifest-failed",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z", user_id: USER_ID, claim_token: "claim-manifest-failed" }], error: null };
      }
      if (name === "record_account_deletion_preflight") return { data: true, error: null };
      if (name === "materialize_account_deletion_storage_manifest") {
        return { data: null, error: { code: "XX000" } };
      }
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC");
    },
  };
  const worker = createAccountDeletionWorker({ client, logger: { info() {}, error() {} } });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 1 });
  assert.equal(calls.some((call) => call.name === "disconnect_pinterest_for_account_deletion"), false);
  const finish = calls.find((call) => call.name === "finish_account_deletion_job");
  assert.equal(finish.args.p_outcome, "retry");
  assert.equal(finish.args.p_error_code, "xx000");
});

test("worker executes the separately claimed content-erasure stage", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{
          job_id: "job-erase",
          request_id: "request-job-erase",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z",
          user_id: USER_ID,
          step_key: "erase_content",
          claim_token: "claim-erase",
        }], error: null };
      }
      if (name === "erase_account_deletion_content") {
        return { data: {
          erased: true,
          projects: 2,
          schedules: 3,
          publications: 1,
          financial_records_retained: true,
        }, error: null };
      }
      if (name === "list_account_deletion_storage_manifest") return { data: [], error: null };
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const worker = createAccountDeletionWorker({ client, logger: { info() {}, error() {} } });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 1, retried: 0 });
  assert.equal(calls[1].name, "erase_account_deletion_content");
  assert.equal(calls[1].args.p_job_id, "job-erase");
  assert.equal(calls[1].args.p_claim_token, "claim-erase");
  assert.equal(calls[2].name, "finish_account_deletion_job");
  assert.equal(calls[2].args.p_outcome, "succeeded");
});

test("worker retries content erasure unless the RPC explicitly confirms retained financial records", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{
          job_id: "job-erase-unsafe",
          request_id: "request-job-erase-unsafe",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z",
          user_id: USER_ID,
          step_key: "erase_content",
          claim_token: "claim-erase-unsafe",
        }], error: null };
      }
      if (name === "erase_account_deletion_content") {
        return { data: { erased: true, financial_records_retained: false }, error: null };
      }
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const worker = createAccountDeletionWorker({ client, logger: { info() {}, error() {} } });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 1 });
  const finish = calls.find((call) => call.name === "finish_account_deletion_job");
  assert.equal(finish.args.p_outcome, "retry");
  assert.equal(finish.args.p_error_code, "content_erasure_unconfirmed");
});

test("worker removes only manifested Storage objects and confirms lifecycle completion", async () => {
  const calls = [];
  const removedObjects = [];
  let listCalls = 0;
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{
          job_id: "job-storage",
          request_id: "request-job-storage",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z",
          user_id: USER_ID,
          step_key: "erase_content",
          claim_token: "claim-storage",
        }], error: null };
      }
      if (name === "erase_account_deletion_content") {
        return { data: { erased: true, financial_records_retained: true }, error: null };
      }
      if (name === "list_account_deletion_storage_manifest") {
        listCalls += 1;
        return {
          data: listCalls === 1
            ? [
                { bucket_id: "pin-images", object_path: "pins/123-0123456789abcdef0123456789abcdef.webp" },
                { bucket_id: "pin-images", object_path: "pins/generation-0123456789abcdef0123456789abcdef.webp" },
              ]
            : [],
          error: null,
        };
      }
      if (name === "mark_account_deletion_storage_object_deleted") return { data: true, error: null };
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const worker = createAccountDeletionWorker({
    client,
    deleteImageObject: async (args) => { removedObjects.push(args); return true; },
    logger: { info() {}, error() {} },
  });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 1, retried: 0 });
  assert.equal(removedObjects.length, 2);
  assert.equal(removedObjects[0].bucket, "pin-images");
  assert.equal(removedObjects[0].objectPath, "pins/123-0123456789abcdef0123456789abcdef.webp");
  assert.equal(removedObjects[1].bucket, "pin-images");
  assert.equal(removedObjects[1].objectPath, "pins/generation-0123456789abcdef0123456789abcdef.webp");
  assert.equal(calls.some((call) => call.name === "mark_account_deletion_storage_object_deleted"), true);
});




test("worker fails closed when the first Storage manifest response is not an array", async () => {
  const calls = [];
  const removedObjects = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{ job_id: "job-invalid-manifest",
          request_id: "request-job-invalid-manifest",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z", user_id: USER_ID, step_key: "erase_content", claim_token: "claim-invalid-manifest" }], error: null };
      }
      if (name === "erase_account_deletion_content") {
        return { data: { erased: true, financial_records_retained: true }, error: null };
      }
      if (name === "list_account_deletion_storage_manifest") return { data: null, error: null };
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const worker = createAccountDeletionWorker({
    client,
    deleteImageObject: async (args) => { removedObjects.push(args); return true; },
    logger: { info() {}, error() {} },
  });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 1 });
  assert.equal(removedObjects.length, 0, "no Storage object may be deleted from an invalid manifest response");
  const finish = calls.find((call) => call.name === "finish_account_deletion_job");
  assert.equal(finish.args.p_outcome, "retry");
  assert.equal(finish.args.p_error_code, "invalid_storage_manifest_response");
});

test("worker fails closed when the remaining Storage manifest check is not an array", async () => {
  const calls = [];
  const removedObjects = [];
  let listCalls = 0;
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{ job_id: "job-invalid-remaining-manifest",
          request_id: "request-job-invalid-remaining-manifest",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z", user_id: USER_ID, step_key: "erase_content", claim_token: "claim-invalid-remaining-manifest" }], error: null };
      }
      if (name === "erase_account_deletion_content") {
        return { data: { erased: true, financial_records_retained: true }, error: null };
      }
      if (name === "list_account_deletion_storage_manifest") {
        listCalls += 1;
        return { data: listCalls === 1 ? [] : null, error: null };
      }
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const worker = createAccountDeletionWorker({
    client,
    deleteImageObject: async (args) => { removedObjects.push(args); return true; },
    logger: { info() {}, error() {} },
  });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 1 });
  assert.equal(listCalls, 2, "the remaining-manifest check must run");
  assert.equal(removedObjects.length, 0);
  const finish = calls.find((call) => call.name === "finish_account_deletion_job");
  assert.equal(finish.args.p_outcome, "retry");
  assert.equal(finish.args.p_error_code, "invalid_storage_manifest_response");
});

test("worker schedules a fast retry when more Storage manifest batches remain", async () => {
  const calls = [];
  const removedObjects = [];
  let listCalls = 0;
  const firstBatch = Array.from({ length: 100 }, (_, i) => ({
    bucket_id: "pin-images",
    object_path: `pins/${i + 1}-0123456789abcdef0123456789abcdef.webp`,
  }));
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{
          job_id: "job-storage-batches",
          request_id: "request-job-storage-batches",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z",
          user_id: USER_ID,
          step_key: "erase_content",
          claim_token: "claim-storage-batches",
        }], error: null };
      }
      if (name === "erase_account_deletion_content") {
        return { data: { erased: true, financial_records_retained: true }, error: null };
      }
      if (name === "list_account_deletion_storage_manifest") {
        listCalls += 1;
        return {
          data: listCalls === 1 ? firstBatch : [{ bucket_id: "pin-images", object_path: "pins/101-0123456789abcdef0123456789abcdef.webp" }],
          error: null,
        };
      }
      if (name === "mark_account_deletion_storage_object_deleted") return { data: true, error: null };
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const worker = createAccountDeletionWorker({
    client,
    deleteImageObject: async (args) => { removedObjects.push(args); return true; },
    logger: { info() {}, error() {} },
  });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 1 });
  assert.equal(removedObjects.length, 100);
  const finish = calls.find((call) => call.name === "finish_account_deletion_job");
  assert.equal(finish.args.p_outcome, "retry");
  assert.equal(finish.args.p_error_code, "storage_manifest_batch_remaining");
});

test("worker refuses unsafe Storage manifest paths without deleting objects", async () => {
  const calls = [];
  const removedObjects = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{
          job_id: "job-storage-invalid",
          request_id: "request-job-storage-invalid",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z",
          user_id: USER_ID,
          step_key: "erase_content",
          claim_token: "claim-storage-invalid",
        }], error: null };
      }
      if (name === "erase_account_deletion_content") {
        return { data: { erased: true, financial_records_retained: true }, error: null };
      }
      if (name === "list_account_deletion_storage_manifest") {
        return { data: [{ bucket_id: "pin-images", object_path: "pins/../private/secret.png" }], error: null };
      }
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const worker = createAccountDeletionWorker({
    client,
    deleteImageObject: async (args) => { removedObjects.push(args); return true; },
    logger: { info() {}, error() {} },
  });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 1 });
  assert.equal(removedObjects.length, 0);
  const finish = calls.find((call) => call.name === "finish_account_deletion_job");
  assert.equal(finish.args.p_outcome, "retry");
  assert.equal(finish.args.p_error_code, "invalid_storage_manifest_entry");
});


test("worker finalizes only through the fenced tombstone RPC", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{
          job_id: "job-finalize",
          request_id: "request-job-finalize",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z",
          user_id: USER_ID,
          step_key: "finalize",
          claim_token: "claim-finalize",
        }], error: null };
      }
      if (name === "finalize_account_deletion") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const worker = createAccountDeletionWorker({ client, logger: { info() {}, error() {} } });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 1, retried: 0 });
  assert.equal(calls[1].name, "finalize_account_deletion");
  assert.equal(calls[1].args.p_claim_token, "claim-finalize");
  assert.equal(calls.some((call) => call.name === "finish_account_deletion_job"), false);
});



test("account deletion claim accepts only bounded jobs with complete unique lease identity", () => {
  const { isValidDeletionJobBatch } = require("../accountDeletionWorker");
  const valid = [{ job_id: "job-1", request_id: "request-1", user_id: USER_ID, step_key: "preflight", claim_token: "claim-1", attempts: 1, lease_expires_at: "2026-11-18T16:00:00.000Z" }];
  assert.equal(isValidDeletionJobBatch([], 1), true);
  assert.equal(isValidDeletionJobBatch(valid, 1), true);
  for (const malformed of [null, undefined, {}, "not-an-array", [null], [{ ...valid[0], claim_token: "" }], [{ ...valid[0], user_id: null }], [{ ...valid[0], step_key: "unknown" }], [{ ...valid[0], attempts: 0 }], [{ ...valid[0], lease_expires_at: "not-a-date" }], [valid[0], valid[0]], [valid[0], { ...valid[0], job_id: "job-2",
          request_id: "request-job-2",
          attempts: 1,
          lease_expires_at: "2026-11-19T00:00:00.000Z", claim_token: "claim-2" }]]) {
    assert.equal(isValidDeletionJobBatch(malformed, 1), false);
  }
});

test("account deletion worker rejects malformed claim responses before any destructive stage RPC", async () => {
  for (const data of [null, {}, "not-an-array", [{ job_id: "job-incomplete" }]]) {
    const calls = [];
    const client = { async rpc(name) { calls.push(name); if (name === "claim_account_deletion_jobs") return { data, error: null }; throw new Error("unexpected side effect RPC: " + name); } };
    const worker = createAccountDeletionWorker({ client, logger: { info() {}, error() {} } });
    await assert.rejects(worker.tick(), /invalid job batch/);
    assert.deepEqual(calls, ["claim_account_deletion_jobs"]);
  }
});

test("account deletion exact row counts fail closed on null, missing, fractional, negative or unsafe values", async () => {
  const makeClient = (count) => ({
    from() {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ count, error: null });
            },
          };
        },
      };
    },
  });

  assert.equal(await countOwnedRows(makeClient(0), "projects", USER_ID), 0);
  assert.equal(await countOwnedRows(makeClient(7), "projects", USER_ID), 7);

  for (const malformed of [null, undefined, "0", 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      countOwnedRows(makeClient(malformed), "projects", USER_ID),
      (error) => error.code === "invalid_exact_count" && error.table === "projects"
    );
  }
});

test("account deletion exact count helper rejects malformed values instead of silently reporting zero", () => {
  const { normalizeExactCount } = require("../accountDeletionWorker");
  for (const malformed of [null, undefined, "0", NaN, Infinity, -1, 0.25, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => normalizeExactCount(malformed, "credit_transactions"),
      (error) => error.code === "invalid_exact_count" && error.table === "credit_transactions"
    );
  }
  assert.equal(normalizeExactCount(0, "credit_transactions"), 0);
  assert.equal(normalizeExactCount(42, "credit_transactions"), 42);
});
