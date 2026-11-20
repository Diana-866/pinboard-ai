"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * publishPin() is the function that creates a real pin on a customer's Pinterest account.
 * It had no behavioural test at all: every guarantee about it was asserted by reading the
 * source, and a reader cannot tell whether a fence actually runs before the POST.
 *
 * The outcomes that matter are the ones a duplicate would be irreversible in:
 *  - a reservation that is not "started" must stop the call before Pinterest is touched;
 *  - a 429 or a 5xx must NOT be retried, because Pinterest may already have created the pin;
 *  - a lost local commit after a successful POST must be reported as "created but
 *    unconfirmed" (blocking a resend), never as a plain failure the worker would retry.
 *
 * Supabase and axios are replaced through the require cache; the schedule helpers are the
 * real ones, so what is tested is the composition the server actually runs.
 */

process.env.PINTEREST_CLIENT_ID = "client-id";
process.env.PINTEREST_CLIENT_SECRET = "client-secret";
process.env.PINTEREST_REDIRECT_URI = "https://app.example.com/api/pinterest/callback";
// Token encryption is mandatory: requireConfigured() refuses to run without a key, which is
// itself a guarantee worth keeping. The account row therefore holds real ciphertext.
process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const supabasePath = require.resolve("../supabase");
const axiosPath = require.resolve("axios");
const pinterestPath = require.resolve("../pinterest");

const { encryptToken } = require("../pinterestTokenCrypto");

const USER_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const PIN_ID = "7c1d9b52-9a48-4c1f-8f0a-9f2f5c6d1e33";
const ACCOUNT_ID = "8f2c1c8e-4a52-4a1f-9d43-1f0e4c3b7a11";
const BOARD_ID = "999888777";
const REMOTE_PIN_ID = "1122334455";
const TOKEN = "ptoken-live-1";

function pinRow(overrides = {}) {
  return {
    id: PIN_ID,
    board_id: "board-uuid",
    title: "Осенний рецепт",
    description: "Тыквенный суп с имбирём",
    image_url: "https://cdn.example.com/pin.jpg",
    status: "approved",
    boards: {
      id: "board-uuid",
      title: "Рецепты",
      project_id: "project-uuid",
      projects: { id: "project-uuid", user_id: USER_ID, website_url: "https://shop.example.com/soup" },
    },
    ...overrides,
  };
}

function accountRow(overrides = {}) {
  return {
    id: ACCOUNT_ID,
    user_id: USER_ID,
    username: "pinposy",
    access_token: encryptToken(TOKEN),
    refresh_token: encryptToken("rtoken-live-1"),
    token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    disconnected_at: null,
    refresh_state: "ready",
    updated_at: "2026-11-18T00:00:00.000Z",
    ...overrides,
  };
}

function createDouble() {
  const state = {
    pin: pinRow(),
    account: accountRow(),
    ledger: null,
    scheduleRow: { id: "schedule-1" },
    rpc: {},
    rpcCalls: [],
    axiosCalls: [],
    scheduleUpdates: [],
    ledgerLookups: 0,
    scheduleFinalizeError: null,
    scheduleRead: { data: null, error: null },
    publicationQueryError: null,
    publicationLookupThrows: false,
  };

  function builder(kind) {
    const ops = [];
    const self = {
      select(columns) { ops.push(["select", columns]); return self; },
      update(values) { ops.push(["update", values]); return self; },
      insert(values) { ops.push(["insert", values]); return self; },
      eq(column, value) { ops.push(["eq", column, value]); return self; },
      is(column, value) { ops.push(["is", column, value]); return self; },
      not(column, operator, value) { ops.push(["not", column, operator, value]); return self; },
      gte(column, value) { ops.push(["gte", column, value]); return self; },
      lt(column, value) { ops.push(["lt", column, value]); return self; },
      order(column, options) { ops.push(["order", column, options]); return self; },
      limit(value) { ops.push(["limit", value]); return self; },
      async maybeSingle() {
        if (kind === "pins") return { data: state.pin, error: null };
        if (kind === "accounts") return { data: state.account, error: null };
        if (kind === "publications") {
          state.ledgerLookups += 1;
          if (state.publicationLookupThrows) throw new Error("ledger read exploded");
          return { data: state.publicationQueryError ? null : state.ledger, error: state.publicationQueryError };
        }
        if (kind === "schedules") {
          if (ops.some(([op]) => op === "update")) {
            state.scheduleUpdates.push(ops);
            if (state.scheduleFinalizeError) return { data: null, error: state.scheduleFinalizeError };
            return { data: state.scheduleRow, error: null };
          }
          return state.scheduleRead;
        }
        throw new Error(`unexpected table ${kind}`);
      },
      // getAccounts() awaits the builder directly and expects a list; every other read
      // ends in maybeSingle(). A double that returned one row for both hid that difference
      // and made the whole publish path unreachable.
      then(resolve, reject) {
        if (kind === "accounts" && !ops.some(([op]) => op === "update")) {
          return Promise.resolve({ data: state.account ? [state.account] : [], error: null }).then(resolve, reject);
        }
        return Promise.resolve(self.maybeSingle()).then(resolve, reject);
      },
    };
    return self;
  }

  const supabase = {
    from(table) {
      const kind = { pins: "pins", pinterest_accounts: "accounts", pinterest_publications: "publications", pin_schedules: "schedules" }[table];
      if (!kind) throw new Error(`unexpected table ${table}`);
      return builder(kind);
    },
    async rpc(name, params) {
      state.rpcCalls.push({ name, params });
      const handler = state.rpc[name];
      if (!handler) throw new Error(`unexpected rpc ${name}`);
      return handler(params);
    },
  };

  const axios = async (config) => {
    state.axiosCalls.push(config);
    const url = String(config.url || "");
    if (url.endsWith(`/boards/${BOARD_ID}`)) {
      return state.boardResponse || { status: 200, data: { id: BOARD_ID } };
    }
    if (url.endsWith("/pins")) {
      if (state.postTransportError) throw state.postTransportError;
      const scripted = state.postResponses.shift();
      if (!scripted) throw new Error("unexpected POST /pins");
      return scripted;
    }
    throw new Error(`unexpected axios call ${config.method} ${url}`);
  };
  axios.post = async () => { throw new Error("unexpected axios.post"); };
  state.postResponses = [];
  state.boardResponse = null;
  state.postTransportError = null;

  return { state, supabase, axios };
}

function loadPinterest() {
  const double = createDouble();
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: double.supabase };
  require.cache[axiosPath] = { id: axiosPath, filename: axiosPath, loaded: true, exports: double.axios };
  delete require.cache[pinterestPath];
  const pinterest = require("../pinterest");
  return { pinterest, state: double.state };
}

function started(reservation = {}) {
  return async () => ({ data: { status: "started", ...reservation }, error: null });
}

/** Default reservations a healthy publish needs; a test overrides only the one it is about. */
function withRpcs(state, overrides = {}) {
  state.rpc = {
    begin_pinterest_publish_v2: started(),
    complete_pinterest_publish_v2: async () => ({ data: null, error: null }),
    fail_pinterest_publish_v2: async () => ({ data: null, error: null }),
    record_pinterest_publish_unknown_v2: async () => ({ data: true, error: null }),
    ...overrides,
  };
  return state;
}

async function rejection(promise) {
  return promise.then(() => null, (error) => error);
}

test("a pin that is not approved is refused before Pinterest is contacted", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state);
  state.pin = pinRow({ status: "pending" });

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 409);
  assert.equal(error.retryable, false);
  assert.deepEqual(state.axiosCalls, [], "no board check, no POST");
  assert.deepEqual(state.rpcCalls, [], "no reservation may be taken for a pin that cannot be published");
});

test("a pin without an image is refused and never reaches Pinterest", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state);
  state.pin = pinRow({ image_url: null });

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 422);
  assert.match(error.message, /изображения/);
  assert.deepEqual(state.rpcCalls, []);
});

test("an empty board id is refused instead of posting to an unspecified board", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state);

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, "   "));
  assert.equal(error.httpStatus, 422);
  assert.match(error.message, /board_id/);
  assert.deepEqual(state.axiosCalls, []);
});

test("the destination link is validated before the reservation, not inside the POST", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state);
  state.pin = pinRow({
    boards: { id: "board-uuid", projects: { id: "p", user_id: USER_ID, website_url: "javascript:alert(1)" } },
  });

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 422);
  assert.match(error.message, /HTTP- или HTTPS/);
  assert.deepEqual(state.rpcCalls, [], "a bad link must be caught before the reservation is taken");
});

test("a healthy publish creates exactly one pin and confirms it once", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state);
  state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });

  const result = await pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID);
  assert.deepEqual(result, { ok: true, pinterest_pin_id: REMOTE_PIN_ID, board_id: BOARD_ID });

  const posts = state.axiosCalls.filter((call) => String(call.url).endsWith("/pins"));
  assert.equal(posts.length, 1, "one pin, one POST");
  const body = posts[0].data;
  assert.equal(body.board_id, BOARD_ID);
  assert.equal(body.media_source.url, "https://cdn.example.com/pin.jpg");
  assert.equal(body.link, "https://shop.example.com/soup");
  assert.equal(body.title.slice(0, 100), "Осенний рецепт");

  const complete = state.rpcCalls.filter((call) => call.name === "complete_pinterest_publish_v2");
  assert.equal(complete.length, 1);
  assert.equal(complete[0].params.p_pinterest_pin_id, REMOTE_PIN_ID);
  assert.equal(complete[0].params.p_pinterest_board_id, BOARD_ID);
  assert.equal(complete[0].params.p_pinterest_account_id, ACCOUNT_ID);
});

test("every non-started reservation status stops the call, and only 'unknown' names the duplicate risk", async () => {
  const cases = [
    ["pin_not_approved", 409, /больше не одобрен/],
    ["processing", 409, /уже выполняется/],
    ["unknown", 409, /Результат не подтверждён|результат не подтверждён/],
    ["failed", 409, /не подтверждён как безопасный/],
    ["something-new", 503, /Не удалось безопасно зарезервировать/],
  ];

  for (const [status, expectedStatus, message] of cases) {
    const { pinterest, state } = loadPinterest();
    withRpcs(state, { begin_pinterest_publish_v2: started({ status }) });
    state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });

    const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
    assert.ok(error, `reservation ${status} must not publish`);
    assert.equal(error.httpStatus, expectedStatus, status);
    assert.match(error.message, message, status);
    assert.deepEqual(
      state.axiosCalls.filter((call) => String(call.url).endsWith("/pins")),
      [],
      `${status} must stop before POST /pins`
    );
  }
});

test("an already published reservation is reported as done without a second POST", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    begin_pinterest_publish_v2: started({ status: "published", pinterest_pin_id: REMOTE_PIN_ID, pinterest_board_id: BOARD_ID }),
  });

  const result = await pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID);
  assert.deepEqual(result, { ok: true, already_published: true, pinterest_pin_id: REMOTE_PIN_ID, board_id: BOARD_ID });
  assert.deepEqual(state.axiosCalls.filter((call) => String(call.url).endsWith("/pins")), []);
});

test("an existing publication on a different board is a conflict, not a success", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    begin_pinterest_publish_v2: started({ status: "published", pinterest_pin_id: REMOTE_PIN_ID, pinterest_board_id: "111" }),
  });

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 409, "reusing a pin id from another board would report a success that does not exist");
  assert.equal(error.code, "PINTEREST_PUBLICATION_IDENTITY_MISMATCH");
});

test("a 429 from Pinterest is not replayed, because the pin may already exist", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state);
  state.postResponses.push({ status: 429, data: { message: "slow down" }, headers: { "retry-after": "5" } });

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  const posts = state.axiosCalls.filter((call) => String(call.url).endsWith("/pins"));
  assert.equal(posts.length, 1, "a rate-limited create must never be replayed automatically");
  assert.equal(error.httpStatus, 502);
  const journal = state.rpcCalls.filter((call) => call.name === "fail_pinterest_publish_v2");
  assert.equal(journal.length, 1);
  assert.equal(journal[0].params.p_outcome_unknown, true, "429 is ambiguous: the pin may have been created");
});

test("a client-side rejection is journaled as a known failure, so the operator may retry", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state);
  state.postResponses.push({ status: 400, data: { message: "invalid media" }, headers: {} });

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 502);
  assert.match(error.message, /invalid media/);
  const journal = state.rpcCalls.filter((call) => call.name === "fail_pinterest_publish_v2");
  assert.equal(journal[0].params.p_outcome_unknown, false, "400 means no pin was created");
  assert.match(journal[0].params.p_error, /HTTP 400/);
});

test("a 5xx is journaled as an unknown outcome and blocks a resend", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state);
  state.postResponses.push({ status: 503, data: "gateway", headers: {} });

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 502);
  assert.match(error.message, /не подтвердил результат/);
  const journal = state.rpcCalls.filter((call) => call.name === "fail_pinterest_publish_v2");
  assert.equal(journal[0].params.p_outcome_unknown, true);
});

test("a success without a pin id is treated as unconfirmed and blocks a resend", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state);
  state.postResponses.push({ status: 201, data: { id: "" }, headers: {} });

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.ok(error, "a success without an id must not be reported as published");
  assert.equal(error.httpStatus, 502);
  assert.match(error.message, /не вернул ID/);
  const journal = state.rpcCalls.filter((call) => call.name === "fail_pinterest_publish_v2");
  assert.equal(journal[0].params.p_outcome_unknown, true);
  assert.deepEqual(
    state.rpcCalls.filter((call) => call.name === "complete_pinterest_publish_v2"),
    [],
    "a completion without an id must never be recorded as published"
  );
});

test("a lost transport error after the POST is journaled, not retried", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state);
  // axios rejects: timeout, DNS, socket reset - all ambiguous. The failure has to be
  // configured inside the double before pinterest.js is loaded: it binds axios at require
  // time, so swapping the require cache afterwards would leave this branch untested while
  // the test still passed on the double's own "unexpected POST" error.
  const transport = new Error("socket hang up");
  transport.code = "ECONNRESET";
  state.postTransportError = transport;

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 502);
  assert.match(error.message, /не отвечает/);
  assert.equal(state.axiosCalls.filter((call) => String(call.url).endsWith("/pins")).length, 1,
    "one attempt, no replay");
  const journal = state.rpcCalls.filter((call) => call.name === "fail_pinterest_publish_v2");
  assert.equal(journal.length, 1);
  assert.equal(journal[0].params.p_outcome_unknown, true, "a transport failure may hide a created pin");
});

test("a local commit error is a 503 that blocks the resend when the ledger cannot confirm it", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    complete_pinterest_publish_v2: async () => ({ data: null, error: { message: "connection lost" } }),
  });
  state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });
  state.ledger = null;

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 503);
  assert.match(error.message, /требуется сверка/);
  const journal = state.rpcCalls.filter((call) => call.name === "record_pinterest_publish_unknown_v2");
  assert.equal(journal.length, 1, "the remote id must be recorded for reconciliation");
  assert.equal(journal[0].params.p_pinterest_pin_id, REMOTE_PIN_ID);
  assert.deepEqual(
    state.rpcCalls.filter((call) => call.name === "fail_pinterest_publish_v2"),
    [],
    "a known remote id is not the same as an unknown outcome"
  );
});

test("a commit error is recognised as success when the ledger already holds the same pin", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    complete_pinterest_publish_v2: async () => ({ data: null, error: { message: "connection lost" } }),
  });
  state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });
  state.ledger = {
    user_id: USER_ID,
    pin_id: PIN_ID,
    pinterest_account_id: ACCOUNT_ID,
    pinterest_pin_id: REMOTE_PIN_ID,
    pinterest_board_id: BOARD_ID,
  };

  const result = await pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID);
  assert.deepEqual(result, { ok: true, already_published: true, pinterest_pin_id: REMOTE_PIN_ID, board_id: BOARD_ID });
  assert.deepEqual(
    state.rpcCalls.filter((call) => call.name === "record_pinterest_publish_unknown_v2"),
    [],
    "a confirmed commit must not be overwritten by an unknown-outcome journal entry"
  );
});

test("a ledger that holds a different pin does not confirm the commit", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    complete_pinterest_publish_v2: async () => ({ data: null, error: { message: "connection lost" } }),
  });
  state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });
  state.ledger = {
    user_id: USER_ID,
    pin_id: PIN_ID,
    pinterest_account_id: ACCOUNT_ID,
    pinterest_pin_id: "999",
    pinterest_board_id: BOARD_ID,
  };

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 503);
  assert.equal(state.rpcCalls.filter((call) => call.name === "record_pinterest_publish_unknown_v2").length, 1);
});

test("an unreadable ledger still produces a 503, never a success", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    complete_pinterest_publish_v2: async () => ({ data: null, error: { message: "connection lost" } }),
    record_pinterest_publish_unknown_v2: async () => ({ data: false, error: null }),
  });
  state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });
  state.publicationQueryError = { message: "ledger unavailable" };

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 503);
  assert.deepEqual(
    state.rpcCalls.filter((call) => call.name === "complete_pinterest_publish_v2").length,
    1,
    "the POST is not repeated while looking for a way to record it"
  );
});

test("a lost schedule claim aborts before the POST and is not written into the shared journal", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    begin_scheduled_pinterest_publish: started(),
    begin_pinterest_publish_v2: async () => { throw new Error("the unscheduled reservation must not be used"); },
  });
  const claimLost = new Error("claim lost");
  claimLost.code = "SCHEDULE_CLAIM_LOST";

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID, null, ACCOUNT_ID, {
    scheduleId: "schedule-1",
    claimToken: "claim-token-1",
    assertClaimCurrent: async () => { throw claimLost; },
  }));

  assert.equal(error.code, "SCHEDULE_CLAIM_LOST");
  assert.deepEqual(
    state.rpcCalls.filter((call) => call.name === "fail_pinterest_publish_v2"),
    [],
    "a stale worker must not mark the attempt as failed"
  );
  assert.deepEqual(state.axiosCalls.filter((call) => String(call.url).endsWith("/pins")), []);
});

test("a scheduled publish that finds the pin already published finalizes this claim instead of leaving it stuck", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    begin_scheduled_pinterest_publish: started({
      status: "published",
      pinterest_pin_id: REMOTE_PIN_ID,
      pinterest_board_id: BOARD_ID,
    }),
  });

  const result = await pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID, null, ACCOUNT_ID, {
    scheduleId: "schedule-1",
    claimToken: "claim-token-1",
  });

  assert.deepEqual(result, { ok: true, already_published: true, pinterest_pin_id: REMOTE_PIN_ID, board_id: BOARD_ID });
  assert.equal(state.scheduleUpdates.length, 1);
  const [, values] = state.scheduleUpdates[0].find(([op]) => op === "update");
  assert.equal(values.status, "published");
  assert.equal(values.pinterest_pin_id, REMOTE_PIN_ID);
  assert.equal(values.claim_token, null);
  const eqs = Object.fromEntries(state.scheduleUpdates[0].filter(([op]) => op === "eq").map(([, column, value]) => [column, value]));
  assert.equal(eqs.claim_token, "claim-token-1", "the update must be fenced by the claim it is completing");
  assert.equal(eqs.status, "publishing");
});

test("a scheduled publish whose finalize fails says the pin exists and blocks a resend", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    begin_scheduled_pinterest_publish: started({
      status: "published",
      pinterest_pin_id: REMOTE_PIN_ID,
      pinterest_board_id: BOARD_ID,
    }),
  });
  state.scheduleFinalizeError = { message: "row locked" };

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID, null, ACCOUNT_ID, {
    scheduleId: "schedule-1",
    claimToken: "claim-token-1",
  }));
  assert.equal(error.httpStatus, 503);
  assert.match(error.message, /Повторная отправка заблокирована/);
});

test("a late finalize by another worker is accepted only when the row holds this exact publication", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    begin_scheduled_pinterest_publish: started({
      status: "published",
      pinterest_pin_id: REMOTE_PIN_ID,
      pinterest_board_id: BOARD_ID,
    }),
  });
  // The update matched no row (the claim was taken over), but the row is now published
  // with the same remote pin: that is a durable success, not a lost claim.
  state.scheduleRow = { id: null };
  state.scheduleRead = {
    data: { status: "published", pinterest_pin_id: REMOTE_PIN_ID, pinterest_board_id: BOARD_ID },
    error: null,
  };

  const result = await pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID, null, ACCOUNT_ID, {
    scheduleId: "schedule-1",
    claimToken: "claim-token-1",
  });
  assert.equal(result.already_published, true);
  assert.equal(result.pinterest_pin_id, REMOTE_PIN_ID);
});

test("a scheduled claim that lost the row to a different publication is a conflict", async () => {
  const { pinterest, state } = loadPinterest();
  const cases = [
    [{ data: null, error: null }, "no row at all"],
    [{ data: { status: "publishing", pinterest_pin_id: null, pinterest_board_id: BOARD_ID }, error: null }, "still publishing"],
    [{ data: { status: "published", pinterest_pin_id: "777", pinterest_board_id: BOARD_ID }, error: null }, "different pin"],
    [{ data: { status: "published", pinterest_pin_id: REMOTE_PIN_ID, pinterest_board_id: "111" }, error: null }, "different board"],
    [{ data: null, error: { message: "read failed" } }, "unreadable"],
  ];

  for (const [read, label] of cases) {
    const loaded = loadPinterest();
    withRpcs(loaded.state, {
      begin_scheduled_pinterest_publish: started({
        status: "published",
        pinterest_pin_id: REMOTE_PIN_ID,
        pinterest_board_id: BOARD_ID,
      }),
    });
    loaded.state.scheduleRow = { id: null };
    loaded.state.scheduleRead = read;

    const error = await rejection(loaded.pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID, null, ACCOUNT_ID, {
      scheduleId: "schedule-1",
      claimToken: "claim-token-1",
    }));
    assert.ok(error, `${label} must not be reported as published`);
    if (read.error) {
      assert.equal(error.httpStatus, 503, label);
      assert.match(error.message, /Не удалось проверить итог/, label);
    } else {
      assert.equal(error.httpStatus, 409, label);
      assert.match(error.message, /Требуется сверка/, label);
    }
  }
});

test("an unreadable ledger never turns a commit error into a retryable failure", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    complete_pinterest_publish_v2: async () => ({ data: null, error: { message: "connection lost" } }),
  });
  state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });
  state.publicationLookupThrows = true;

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 503);
  assert.equal(state.rpcCalls.filter((call) => call.name === "record_pinterest_publish_unknown_v2").length, 1,
    "a ledger read that throws is still an unconfirmed commit, so the remote id is journaled");
});

test("when the remote-id journal also fails, the unknown-outcome fence is written instead", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    complete_pinterest_publish_v2: async () => ({ data: null, error: { message: "connection lost" } }),
    record_pinterest_publish_unknown_v2: async () => { throw new Error("journal transport down"); },
  });
  state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 503);
  const fallback = state.rpcCalls.filter((call) => call.name === "fail_pinterest_publish_v2");
  assert.equal(fallback.length, 1, "the fence must fall back to the older journal, not to silence");
  assert.equal(fallback[0].params.p_outcome_unknown, true);
});

/** A supabase-js builder is a thenable with `then` only - the real client has no `.catch` (2.116.0). */
function builderThatRejects(message) {
  return { then: (onFulfilled, onRejected) => Promise.reject(new Error(message)).then(onFulfilled, onRejected) };
}

test("a journal builder that rejects without a catch method still writes the fallback fence", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    complete_pinterest_publish_v2: async () => ({ data: null, error: { message: "connection lost" } }),
    // The honest double: a builder rejects and has no `.catch`, exactly like @supabase/postgrest-js. A
    // plain async function here would hide the defect, because it does have `.catch`.
    record_pinterest_publish_unknown_v2: () => builderThatRejects("journal transport down"),
    fail_pinterest_publish_v2: async () => ({ data: null, error: null }),
  });
  state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 503, `expected the pin-exists refusal, got ${error.message}`);
  const fallback = state.rpcCalls.filter((call) => call.name === "fail_pinterest_publish_v2");
  assert.equal(fallback.length, 1, "the fence must still be written when the builder rejects without .catch");
  assert.equal(fallback[0].params.p_outcome_unknown, true);
  assert.equal(state.axiosCalls.filter((call) => String(call.url).endsWith("/pins")).length, 1,
    "a journal failure must never repeat the remote POST");
});

test("even when both journal writes fail the caller is told the pin exists", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state, {
    complete_pinterest_publish_v2: async () => ({ data: null, error: { message: "connection lost" } }),
    record_pinterest_publish_unknown_v2: async () => { throw new Error("journal transport down"); },
    fail_pinterest_publish_v2: async () => { throw new Error("journal transport down too"); },
  });
  state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });

  const error = await rejection(pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 503);
  assert.match(error.message, /создал пин/);
  assert.equal(state.axiosCalls.filter((call) => String(call.url).endsWith("/pins")).length, 1,
    "the POST is never repeated because a journal write failed");
});

test("the board is verified against the connected account before any reservation", async () => {
  const cases = [
    [{ status: 403, data: { message: "forbidden" } }, 422, /не найдена или недоступна/],
    [{ status: 404, data: { message: "not found" } }, 422, /не найдена или недоступна/],
    [{ status: 500, data: { message: "boom" } }, 502, /Не удалось проверить/],
  ];

  for (const [boardResponse, expectedStatus, message] of cases) {
    const loaded = loadPinterest();
    withRpcs(loaded.state);
    loaded.state.boardResponse = boardResponse;

    const error = await rejection(loaded.pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
    assert.equal(error.httpStatus, expectedStatus, `board ${boardResponse.status}`);
    assert.match(error.message, message, `board ${boardResponse.status}`);
    assert.deepEqual(loaded.state.rpcCalls, [], "a board that is not verified must not reserve a publication");
  }

  // Pinterest answering with a different id means the board is not the one the customer chose.
  const loaded = loadPinterest();
  withRpcs(loaded.state);
  loaded.state.boardResponse = { status: 200, data: { id: "123456" } };
  const error = await rejection(loaded.pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID));
  assert.equal(error.httpStatus, 422);
  assert.match(error.message, /не подтвердил принадлежность/);
  assert.equal(error.retryable, false);
  assert.deepEqual(loaded.state.rpcCalls, []);
});

test("a scheduled publish uses the immutable snapshot creative, not the edited pin", async () => {
  const { pinterest, state } = loadPinterest();
  withRpcs(state);
  // The pin has been edited since the customer scheduled it: the schedule must win.
  state.pin = pinRow({ title: "Отредактировано", description: "Новое описание", image_url: "https://cdn.example.com/new.jpg" });
  state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });

  await pinterest.publishPin(USER_ID, PIN_ID, BOARD_ID, null, ACCOUNT_ID, null, {
    snapshot_title: "Как было запланировано",
    snapshot_description: "Снимок описания",
    snapshot_image_url: "https://cdn.example.com/snapshot.jpg",
    snapshot_destination_url: "https://shop.example.com/snapshot",
  });

  const post = state.axiosCalls.find((call) => String(call.url).endsWith("/pins"));
  assert.equal(post.data.title, "Как было запланировано");
  assert.equal(post.data.description, "Снимок описания");
  assert.equal(post.data.media_source.url, "https://cdn.example.com/snapshot.jpg");
  assert.equal(post.data.link, "https://shop.example.com/snapshot");
});
