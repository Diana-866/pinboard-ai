"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inspectAccountForDeletion,
  createAccountDeletionWorker,
  safeErrorCode,
} = require("../accountDeletionWorker");

const USER_ID = "11111111-1111-4111-8111-111111111111";

function createReadClient({ account = { id: USER_ID, account_status: "deletion_pending" }, failTable = null } = {}) {
  return {
    from(table) {
      const query = {
        filters: [],
        select() { return this; },
        eq(column, value) { this.filters.push([column, value]); return this; },
        in(column, value) { this.filters.push([column, value]); return this; },
        range(start, end) { this.rangeArgs = [start, end]; return this; },
        maybeSingle() {
          return Promise.resolve({ data: table === "users" ? account : null, error: null });
        },
        then(resolve, reject) {
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
  assert.equal(result.sectionsChecked, 10);
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
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        range(start, end) { ranges.push({ table, start, end }); return this; },
        maybeSingle() { return Promise.resolve({ data: { id: USER_ID, account_status: "deletion_pending" }, error: null }); },
        then(resolve, reject) {
          if (table === "projects" && this.rangeArgs?.[0] === 0) {
            return Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}` })), error: null }).then(resolve, reject);
          }
          if (table === "projects") return Promise.resolve({ data: [{ id: "p1000" }], error: null }).then(resolve, reject);
          if (table === "boards" && this.rangeArgs?.[0] === 0) {
            return Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `b${i}` })), error: null }).then(resolve, reject);
          }
          if (table === "boards") return Promise.resolve({ data: [{ id: "b1000" }], error: null }).then(resolve, reject);
          return Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  // Direct-table head counts and per-chunk pin counts return exact counts.
  const originalFrom = client.from.bind(client);
  client.from = (table) => {
    const q = originalFrom(table);
    const select = q.select.bind(q);
    q.select = (columns, options) => {
      q.headOnly = Boolean(options?.head);
      return select(columns, options);
    };
    q.then = (resolve, reject) => {
      if (q.headOnly) return Promise.resolve({ data: null, count: 0, error: null }).then(resolve, reject);
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    };
    return q;
  };
  // This test exercises pagination itself; inventory counts of direct tables are zero.
  const result = await inspectAccountForDeletion(client, USER_ID);
  assert.equal(result.counts.projects, 0);
  assert.ok(ranges.some((r) => r.table === "projects" && r.start === 1000));
  assert.ok(ranges.some((r) => r.table === "boards" && r.start === 1000));
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
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC");
    },
  };
  const worker = createAccountDeletionWorker({ client, logger: { info() {}, error() {} } });
  const result = await worker.tick();
  assert.deepEqual(result, { claimed: 1, completed: 1, retried: 0 });
  assert.equal(calls[0].name, "claim_account_deletion_jobs");
  assert.equal(calls[1].name, "record_account_deletion_preflight");
  assert.equal(calls[1].args.p_claim_token, "claim-1");
  assert.equal(calls[2].name, "finish_account_deletion_job");
  assert.equal(calls[2].args.p_outcome, "succeeded");
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
      if (name === "finish_account_deletion_job") return { data: true, error: null };
      throw new Error("unexpected RPC");
    },
  };
  const worker = createAccountDeletionWorker({ client, logger: { info() {}, error() {} } });
  await worker.tick();
  const inventoryCall = calls.find((call) => call.name === "record_account_deletion_preflight");
  assert.equal(inventoryCall.args.p_inventory.ok, true);
  assert.equal(inventoryCall.args.p_inventory.sectionsChecked, 10);
  assert.equal(Object.keys(inventoryCall.args.p_inventory.counts).length, 10);
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
