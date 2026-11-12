"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inspectAccountForDeletion,
  createAccountDeletionWorker,
  safeErrorCode,
  startLeaseHeartbeat,
} = require("../accountDeletionWorker");

const USER_ID = "11111111-1111-4111-8111-111111111111";

function createReadClient({ account = { id: USER_ID, account_status: "deletion_pending" }, failTable = null, invalidPageTable = null } = {}) {
  return {
    supabaseUrl: "https://project.supabase.co",
    from(table) {
      const query = {
        filters: [],
        select() { return this; },
        eq(column, value) { this.filters.push([column, value]); return this; },
        in(column, value) { this.filters.push([column, value]); return this; },
        order(column, options = {}) { this.orderArgs = [column, options]; return this; },
        range(start, end) { this.rangeArgs = [start, end]; return this; },
        maybeSingle() {
          return Promise.resolve({ data: table === "users" ? account : null, error: null });
        },
        then(resolve, reject) {
          if (table === failTable) return Promise.resolve({ data: null, error: { code: "XX000" } }).then(resolve, reject);
          if (!this.headOnly && table === invalidPageTable) return Promise.resolve({ data: null, error: null }).then(resolve, reject);
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
  const orders = [];
  const client = {
    from(table) {
      const query = {
        filters: [],
        headOnly: false,
        rangeArgs: [0, 999],
        select(_columns, options) { this.headOnly = Boolean(options && options.head); return this; },
        eq(column, value) { this.filters.push([column, value]); return this; },
        in(column, value) { this.filters.push([column, value]); return this; },
        order(column, options = {}) { orders.push({ table, column, options }); return this; },
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
  assert.ok(ranges.some((r) => r.table === "boards" && r.start === 1000));
  assert.ok(orders.some((r) => r.table === "projects" && r.column === "id" && r.options.ascending === true));
  assert.ok(orders.some((r) => r.table === "boards" && r.column === "id" && r.options.ascending === true));
  assert.equal(result.counts.boards, 1001);
});

test("preflight fails closed when an inventory page is null without a database error", async () => {
  await assert.rejects(
    inspectAccountForDeletion(createReadClient({ invalidPageTable: "projects" }), USER_ID),
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
        return { data: [{ job_id: "job-1", user_id: USER_ID, claim_token: "claim-1" }], error: null };
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
  assert.equal(calls[0].args.p_limit, 1);
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
        return { data: [{ job_id: "job-lost", user_id: USER_ID, claim_token: "claim-lost" }], error: null };
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
        return { data: [{ job_id: "job-inventory", user_id: USER_ID, claim_token: "claim-inventory" }], error: null };
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
        return { data: [{ job_id: "job-2", user_id: USER_ID, claim_token: "claim-2" }], error: null };
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
        return { data: [{ job_id: "job-manifest-failed", user_id: USER_ID, claim_token: "claim-manifest-failed" }], error: null };
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
            ? [{ bucket_id: "pin-images", object_path: "pins/123-0123456789abcdef0123456789abcdef.webp" }]
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
  assert.equal(removedObjects.length, 1);
  assert.equal(removedObjects[0].bucket, "pin-images");
  assert.equal(removedObjects[0].objectPath, "pins/123-0123456789abcdef0123456789abcdef.webp");
  assert.equal(calls.some((call) => call.name === "mark_account_deletion_storage_object_deleted"), true);
});


test("worker finalizes only through the fenced tombstone RPC", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") {
        return { data: [{
          job_id: "job-finalize",
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



test("worker drains multiple Storage manifest pages before marking erasure complete", async () => {
  const calls = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    bucket_id: "pin-images",
    object_path: `pins/${1000 + index}-0123456789abcdef0123456789abcdef.webp`,
  }));
  const secondPage = [{
    bucket_id: "pin-images",
    object_path: "pins/generation-abcdef0123456789abcdef0123456789.webp",
  }];
  let listCalls = 0;
  let deleted = 0;
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") return { data: [{
        job_id: "job-storage-pages", user_id: USER_ID, step_key: "erase_content", claim_token: "claim-pages",
      }], error: null };
      if (name === "erase_account_deletion_content") {
        return { data: { erased: true, financial_records_retained: true }, error: null };
      }
      if (name === "list_account_deletion_storage_manifest") {
        listCalls += 1;
        return { data: listCalls === 1 ? firstPage : listCalls === 2 ? secondPage : [], error: null };
      }
      if (name === "mark_account_deletion_storage_object_deleted") return { data: true, error: null };
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const worker = createAccountDeletionWorker({
    client,
    deleteImageObject: async () => { deleted += 1; return true; },
    logger: { info() {}, error() {} },
  });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 1, retried: 0 });
  assert.equal(deleted, 101);
  assert.equal(listCalls, 3);
  assert.equal(calls.filter((call) => call.name === "mark_account_deletion_storage_object_deleted").length, 101);
  const finishIndex = calls.findIndex((call) => call.name === "finish_account_deletion_job");
  const lastListIndex = calls.map((call) => call.name).lastIndexOf("list_account_deletion_storage_manifest");
  assert.ok(finishIndex > lastListIndex);
});

test("worker retries rather than treating an invalid Storage manifest response as empty", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") return { data: [{
        job_id: "job-storage-invalid-response", user_id: USER_ID,
        step_key: "erase_content", claim_token: "claim-invalid-response",
      }], error: null };
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
    logger: { info() {}, error() {} },
  });

  const result = await worker.tick();

  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 1 });
  assert.equal(calls.some((call) =>
    call.name === "finish_account_deletion_job" && call.args.p_outcome === "succeeded"
  ), false);
  const retry = calls.find((call) =>
    call.name === "finish_account_deletion_job" && call.args.p_outcome === "retry"
  );
  assert.equal(retry.args.p_error_code, "invalid_storage_manifest_response");
});

test("worker retries when the fenced Storage manifest mark is not confirmed", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") return { data: [{
        job_id: "job-storage-mark-unconfirmed", user_id: USER_ID,
        step_key: "erase_content", claim_token: "claim-mark-unconfirmed",
      }], error: null };
      if (name === "erase_account_deletion_content") {
        return { data: { erased: true, financial_records_retained: true }, error: null };
      }
      if (name === "list_account_deletion_storage_manifest") {
        return { data: [{ bucket_id: "pin-images", object_path: "pins/456-0123456789abcdef0123456789abcdef.webp" }], error: null };
      }
      if (name === "mark_account_deletion_storage_object_deleted") return { data: false, error: null };
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  let deletionCalls = 0;
  const worker = createAccountDeletionWorker({
    client,
    deleteImageObject: async () => { deletionCalls += 1; return true; },
    logger: { info() {}, error() {} },
  });

  const result = await worker.tick();

  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 1 });
  assert.equal(deletionCalls, 1);
  assert.equal(calls.some((call) =>
    call.name === "finish_account_deletion_job" && call.args.p_outcome === "succeeded"
  ), false);
  assert.equal(calls.some((call) =>
    call.name === "finish_account_deletion_job" && call.args.p_outcome === "retry"
  ), true);
});

test("worker recovers when Storage lifecycle deletion completed before manifest marking", async () => {
  const calls = [];
  let listCalls = 0;
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") return { data: [{
        job_id: "job-storage-recovery", user_id: USER_ID,
        step_key: "erase_content", claim_token: "claim-storage-recovery",
      }], error: null };
      if (name === "erase_account_deletion_content") {
        return { data: { erased: true, financial_records_retained: true }, error: null };
      }
      if (name === "list_account_deletion_storage_manifest") {
        listCalls += 1;
        return { data: listCalls === 1
          ? [{ bucket_id: "pin-images", object_path: "pins/789-0123456789abcdef0123456789abcdef.webp" }]
          : [], error: null };
      }
      // Simulate a previous worker completing the Storage lifecycle delete,
      // then losing its job lease before it could mark the manifest row.
      if (name === "mark_account_deletion_storage_object_deleted") return { data: true, error: null };
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const worker = createAccountDeletionWorker({
    client,
    deleteImageObject: async () => false,
    logger: { info() {}, error() {} },
  });

  const result = await worker.tick();

  assert.deepEqual(result, { claimed: 1, completed: 1, retried: 0 });
  assert.equal(listCalls, 2);
  assert.equal(calls.some((call) =>
    call.name === "mark_account_deletion_storage_object_deleted"
  ), true);
  assert.equal(calls.some((call) =>
    call.name === "finish_account_deletion_job" && call.args.p_outcome === "succeeded"
  ), true);
});

test("worker retries rather than completing when Storage deletion is not confirmed", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") return { data: [{
        job_id: "job-storage-unconfirmed", user_id: USER_ID, step_key: "erase_content", claim_token: "claim-unconfirmed",
      }], error: null };
      if (name === "erase_account_deletion_content") {
        return { data: { erased: true, financial_records_retained: true }, error: null };
      }
      if (name === "list_account_deletion_storage_manifest") {
        return { data: [{ bucket_id: "pin-images", object_path: "pins/123-0123456789abcdef0123456789abcdef.webp" }], error: null };
      }
      // The database must independently reject the manifest mark unless
      // the lifecycle row is already terminally deleted.
      if (name === "mark_account_deletion_storage_object_deleted") return { data: false, error: null };
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const worker = createAccountDeletionWorker({
    client,
    deleteImageObject: async () => false,
    logger: { info() {}, error() {} },
  });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 1 });
  assert.equal(calls.some((call) => call.name === "finish_account_deletion_job" && call.args.p_outcome === "succeeded"), false);
  assert.equal(calls.some((call) => call.name === "finish_account_deletion_job" && call.args.p_outcome === "retry"), true);
  assert.equal(calls.some((call) => call.name === "mark_account_deletion_storage_object_deleted"), true);
});


test("lease heartbeat renews only the current fenced claim and stops cleanly", async () => {
  const calls = [];
  let callback;
  let cancelled = false;
  const client = { async rpc(name, args) { calls.push({ name, args }); return { data: true, error: null }; } };
  const heartbeat = startLeaseHeartbeat({
    client,
    job: { job_id: "job-heartbeat", claim_token: "claim-heartbeat" },
    intervalMs: 12345,
    schedule(fn, ms) { assert.equal(ms, 12345); callback = fn; return { unref() {} }; },
    cancelSchedule() { cancelled = true; },
  });
  await callback();
  assert.equal(heartbeat.lost, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "renew_account_deletion_job_lease");
  assert.deepEqual(calls[0].args, { p_job_id: "job-heartbeat", p_claim_token: "claim-heartbeat", p_lease_seconds: 300 });
  heartbeat.stop();
  assert.equal(cancelled, true);
  await callback();
  assert.equal(calls.length, 1);
});


test("lease heartbeat fails closed when a previous renewal is still pending at the next interval", async () => {
  let callback;
  let resolveRenewal;
  const renewal = new Promise((resolve) => { resolveRenewal = resolve; });
  let calls = 0;
  const heartbeat = startLeaseHeartbeat({
    client: { rpc() { calls += 1; return renewal; } },
    job: { job_id: "job-stalled", claim_token: "claim-stalled" },
    schedule(fn) { callback = fn; return null; },
    cancelSchedule() {},
  });

  const firstTick = callback();
  assert.equal(calls, 1);
  assert.equal(heartbeat.lost, false);

  // The next interval arrives before the database confirms the prior lease.
  await callback();
  assert.equal(heartbeat.lost, true);
  assert.equal(calls, 1, "must not overlap lease-renewal RPCs");

  resolveRenewal({ data: true, error: null });
  await firstTick;
  assert.equal(heartbeat.lost, true, "late renewal cannot restore trust in the claim");
  heartbeat.stop();
});

test("lease heartbeat fails closed when renewal is rejected or errors", async () => {
  for (const response of [{ data: false, error: null }, { data: null, error: { code: "XX000" } }]) {
    let callback;
    const heartbeat = startLeaseHeartbeat({
      client: { async rpc() { return response; } },
      job: { job_id: "job-lost", claim_token: "claim-lost" },
      schedule(fn) { callback = fn; return null; },
      cancelSchedule() {},
    });
    await callback();
    assert.equal(heartbeat.lost, true);
    heartbeat.stop();
  }
  let callback;
  const heartbeat = startLeaseHeartbeat({
    client: { async rpc() { throw new Error("network unavailable"); } },
    job: { job_id: "job-network", claim_token: "claim-network" },
    schedule(fn) { callback = fn; return null; },
    cancelSchedule() {},
  });
  await callback();
  assert.equal(heartbeat.lost, true);
  heartbeat.stop();
});


test("worker stops after Storage deletion when its lease renewal is rejected", async () => {
  const calls = [];
  let heartbeatCallback;
  let storageDeleted = false;
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_account_deletion_jobs") return { data: [{
        job_id: "job-lease-lost-during-storage",
        user_id: USER_ID,
        step_key: "erase_content",
        claim_token: "claim-lease-lost",
      }], error: null };
      if (name === "erase_account_deletion_content") {
        return { data: { erased: true, financial_records_retained: true }, error: null };
      }
      if (name === "renew_account_deletion_job_lease") return { data: false, error: null };
      throw new Error("unexpected RPC: " + name);
    },
  };
  const worker = createAccountDeletionWorker({
    client,
    scheduleHeartbeat(fn) { heartbeatCallback = fn; return { unref() {} }; },
    cancelHeartbeat() {},
    deleteImageObject: async () => {
      storageDeleted = true;
      await heartbeatCallback();
      return true;
    },
    logger: { info() {}, error() {} },
  });

  const result = await worker.tick();

  assert.equal(storageDeleted, true);
  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 0 });
  assert.equal(calls.some((call) => call.name === "mark_account_deletion_storage_object_deleted"), false);
  assert.equal(calls.some((call) => call.name === "finish_account_deletion_job"), false);
});
