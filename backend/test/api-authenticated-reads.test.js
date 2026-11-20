"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { startFakePostgrest } = require("./helpers/fake-postgrest");
const { signSessionToken } = require("../sessionToken");

/**
 * The authenticated read routes were only ever checked for answering 401 without a token: the
 * tenancy filter, the ownership check and the difference between "no row" and "the query failed"
 * had never executed. These tests sign a real session token and drive the real entrypoint over
 * HTTP against a PostgREST stand-in that returns rows.
 */

const BACKEND = path.join(__dirname, "..");
const ENTRY = path.join(BACKEND, "index.js");
const SECRET = "test-jwt-secret-not-for-production";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const BOARD_ID = "44444444-4444-4444-8444-444444444444";

function sessionToken(tokenVersion = 0) {
  return signSessionToken({ id: USER_ID, token_version: tokenVersion }, SECRET);
}

async function startBackend({ tokenVersion = 0, extraEnv = {} } = {}) {
  const db = startFakePostgrest();
  const dbUrl = await db.listen();
  const port = 36000 + Math.floor(Math.random() * 2000);

  // supabase-js uses one path per table, so a route must look at the query to tell the profile
  // read, the token-version read and the entitlement read apart.
  // supabase-js keeps the requested columns in `select`, with or without spaces after commas.
  const selectOf = (query) => String((query && query.select) || "").replace(/\s+/g, "");
  db.table("GET", "users", ({ query }) => {
    if (selectOf(query) === "token_version") return { status: 200, body: [{ token_version: tokenVersion }] };
    if (selectOf(query) === "tariff_plan,tariff_period_end") {
      return { status: 200, body: [{ tariff_plan: "none", tariff_period_end: null }] };
    }
    return {
      status: 200,
      body: [{
        id: USER_ID,
        email: "owner@example.com",
        name: null,
        surname: null,
        credits_balance: 3,
        subscription_tier: "pro",
        tariff_plan: "none",
        onboarded: true,
        preferred_language: "ru",
        password_hash: "hash-that-must-never-leave-the-backend",
      }],
    };
  });
  db.table("GET", "subscriptions", { status: 200, body: [] });
  db.table("GET", "projects", ({ query }) => ({
    status: 200,
    body: selectOf(query) === "id"
      ? [{ id: PROJECT_ID }]
      : [{ id: PROJECT_ID, user_id: USER_ID, title: "Мой проект", niche: "home", created_at: "2026-01-01T00:00:00Z" }],
  }));
  db.table("GET", "boards", ({ query }) => {
    if (query.select && query.select.includes("projects(user_id")) {
      // The ownership check reads one board; the test scripts which owner it carries.
      return { status: 200, body: [{ id: BOARD_ID, title: "Доска", project_id: PROJECT_ID, projects: { user_id: db.ownedBy } }] };
    }
    return {
      status: 200,
      body: [{ id: BOARD_ID, title: "Доска", project_id: PROJECT_ID, created_at: "2026-01-02T00:00:00Z", projects: { niche: "home", website_url: null } }],
    };
  });
  db.table("GET", "pins", ({ query, headers }) => {
    if (selectOf(query) === "id" && headers.prefer && String(headers.prefer).includes("count=exact")) {
      // Exact head-count for the board list: the count lives in the Content-Range header.
      return { status: 200, body: null, headers: { "Content-Range": "*/2" } };
    }
    if (String(query.select || "").includes("boards(")) {
      // The ownership check reads one pin; the test scripts which owner it carries.
      return {
        status: 200,
        body: [{
          id: "55555555-5555-4555-8555-555555555555",
          board_id: BOARD_ID,
          status: "pending",
          boards: { id: BOARD_ID, project_id: PROJECT_ID, projects: { user_id: db.ownedBy } },
        }],
      };
    }
    return {
      status: 200,
      body: [{ id: "55555555-5555-4555-8555-555555555555", board_id: BOARD_ID, title: "Пин", created_at: "2026-01-03T00:00:00Z" }],
    };
  });

  // Write routes answer with the row they "stored": the pin/board/project the handler then reads back.
  db.table("POST", "projects", ({ body }) => ({ status: 201, body: [{ id: PROJECT_ID, ...JSON.parse(body || "{}") }] }));
  db.table("POST", "boards", ({ body }) => ({ status: 201, body: [{ id: BOARD_ID, ...JSON.parse(body || "{}") }] }));

  const child = spawn(process.execPath, [ENTRY], {
    cwd: BACKEND,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      SUPABASE_URL: dbUrl,
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      SUPABASE_ANON_KEY: "test-anon-key",
      JWT_SECRET: SECRET,
      FRONTEND_URL: "https://app.example.com",
      ACCOUNT_DELETION_WORKER_ENABLED: "",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) { ready = true; break; }
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) {
    child.kill("SIGKILL");
    await db.close();
    throw new Error(`backend did not start:\n${output}`);
  }

  return {
    base,
    db,
    output: () => output,
    get(pathname, token = sessionToken()) {
      return fetch(`${base}${pathname}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
        .then(async (response) => ({ status: response.status, body: JSON.parse(await response.text() || "null") }));
    },
    send(method, pathname, payload, token = sessionToken()) {
      return fetch(`${base}${pathname}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          "content-type": "application/json",
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      }).then(async (response) => ({ status: response.status, body: JSON.parse(await response.text() || "null") }));
    },
    async stop() {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await new Promise((resolve) => child.once("exit", resolve));
      }
      await db.close();
    },
  };
}

test("the profile is scoped to the token's owner and its plan comes from the entitlement resolver", async () => {
  const backend = await startBackend();
  try {
    const me = await backend.get("/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.id, USER_ID);
    assert.equal(me.body.email, "owner@example.com");
    assert.equal(me.body.name, null, "a missing optional column must stay null, not become undefined");
    assert.equal(me.body.credits_balance, 3);
    assert.equal(
      me.body.subscription_tier,
      "free",
      "the raw users.subscription_tier said pro; the resolver says the paid period is over, and the resolver wins"
    );
    assert.equal(
      Object.hasOwn(me.body || {}, "password_hash"),
      false,
      "the profile payload must never carry the password hash"
    );

    const userQueries = backend.db.requests.filter((entry) => entry.path === "/rest/v1/users" && String(entry.query.select || "").replace(/\s+/g, "") === "*");
    assert.equal(userQueries.length, 1);
    assert.equal(userQueries[0].query.id, `eq.${USER_ID}`, "the profile read must be filtered by the token's user, not by a request field");
  } finally {
    await backend.stop();
  }
});

test("a token minted before a password reset is refused before the profile is read", async () => {
  const backend = await startBackend({ tokenVersion: 4 });
  try {
    const me = await backend.get("/me", sessionToken(0));
    assert.equal(me.status, 401);
    assert.deepEqual(
      backend.db.requests.filter((entry) => entry.path === "/rest/v1/users" && String(entry.query.select || "").replace(/\s+/g, "") === "*"),
      [],
      "a revoked session must not reach the profile query"
    );
  } finally {
    await backend.stop();
  }
});

test("a failed profile query is an outage, not a deleted account", async () => {
  const backend = await startBackend();
  try {
    backend.db.table("GET", "users", ({ query }) => (
      String(query.select || "").replace(/\s+/g, "") === "token_version"
        ? { status: 200, body: [{ token_version: 0 }] }
        : { status: 500, body: { code: "XX000", message: "connection refused to db.internal:5432" } }
    ));
    const me = await backend.get("/me");
    assert.equal(me.status, 503, "a database error must not be reported as a missing account");
    assert.notEqual(me.body.code, "user_not_found");
    const raw = JSON.stringify(me.body);
    assert.equal(/connection refused|db\.internal|XX000/.test(raw), false, `the 5xx body leaked internals: ${raw}`);
  } finally {
    await backend.stop();
  }
});

test("a genuinely missing account is still a 404 with its machine code", async () => {
  const backend = await startBackend();
  try {
    // An empty result is what the real PostgREST answers for a deleted account: 406 PGRST116.
    backend.db.table("GET", "users", ({ query }) => (
      String((query && query.select) || "").replace(/\s+/g, "") === "token_version"
        ? { status: 200, body: [{ token_version: 0 }] }
        : { status: 200, body: [] }
    ));
    const me = await backend.get("/me");
    assert.equal(me.status, 404);
    assert.equal(me.body.code, "user_not_found");
  } finally {
    await backend.stop();
  }
});

test("the project list is filtered by the token's user and drops the owner column", async () => {
  const backend = await startBackend();
  try {
    const projects = await backend.get("/projects");
    assert.equal(projects.status, 200);
    assert.ok(Array.isArray(projects.body));
    assert.equal(projects.body.length, 1);
    assert.equal(projects.body[0].title, "Мой проект");
    assert.equal(
      Object.hasOwn(projects.body[0], "user_id"),
      false,
      "the client has no use for the owner column and must not receive it"
    );

    const projectQueries = backend.db.requests.filter((entry) => entry.path === "/rest/v1/projects");
    assert.ok(projectQueries.length >= 1);
    for (const query of projectQueries) {
      assert.equal(query.query.user_id, `eq.${USER_ID}`, "every project read must be scoped to the token's user");
    }
  } finally {
    await backend.stop();
  }
});

test("the board list only touches the caller's projects and counts pins per board", async () => {
  const backend = await startBackend();
  try {
    const boards = await backend.get("/boards");
    assert.equal(boards.status, 200);
    assert.equal(boards.body.length, 1);
    assert.equal(boards.body[0].id, BOARD_ID);
    assert.equal(boards.body[0].pin_count, 2, "the count must come from the exact count, not from a downloaded pin list");

    const boardQueries = backend.db.requests.filter((entry) => entry.path === "/rest/v1/boards");
    assert.equal(boardQueries.length, 1);
    assert.deepEqual(
      boardQueries[0].query.project_id,
      `in.(${PROJECT_ID})`,
      "the board query must be bounded by the caller's own project ids"
    );
    assert.equal(
      backend.db.requests.filter((entry) => entry.path === "/rest/v1/projects" && entry.query.user_id !== `eq.${USER_ID}`).length,
      0
    );
  } finally {
    await backend.stop();
  }
});

test("a board owned by another account is a 404, and its pins are never read", async () => {
  const backend = await startBackend();
  try {
    backend.db.ownedBy = OTHER_USER_ID;
    const board = await backend.get(`/boards/${BOARD_ID}`);
    assert.equal(board.status, 404, "ownership is checked in code, not only by the query filter");
    assert.equal(board.body.code, "board_not_found");

    const pins = await backend.get(`/boards/${BOARD_ID}/pins`);
    assert.equal(pins.status, 404);
    assert.equal(
      backend.db.requests.filter((entry) => entry.path === "/rest/v1/pins" && entry.query.board_id).length,
      0,
      "a foreign board's pins must not be queried at all"
    );
  } finally {
    await backend.stop();
  }
});

test("the caller's own board and its pins are served", async () => {
  const backend = await startBackend();
  try {
    backend.db.ownedBy = USER_ID;
    const board = await backend.get(`/boards/${BOARD_ID}`);
    assert.equal(board.status, 200);
    assert.equal(board.body.id, BOARD_ID);

    const pins = await backend.get(`/boards/${BOARD_ID}/pins`);
    assert.equal(pins.status, 200);
    assert.equal(pins.body.length, 1);
    assert.equal(pins.body[0].board_id, BOARD_ID);
    const pinQuery = backend.db.requests.filter((entry) => entry.path === "/rest/v1/pins" && entry.query.board_id).pop();
    assert.equal(pinQuery.query.board_id, `eq.${BOARD_ID}`);
  } finally {
    await backend.stop();
  }
});

test("a failed board lookup is an outage, not a vanished board", async () => {
  const backend = await startBackend();
  try {
    backend.db.table("GET", "boards", ({ query }) => (
      query.select && query.select.includes("projects(user_id")
        ? { status: 500, body: { code: "XX000", message: "canceling statement due to statement timeout" } }
        : { status: 200, body: [] }
    ));
    const board = await backend.get(`/boards/${BOARD_ID}`);
    assert.equal(board.status, 503, "a database error must not tell the customer their board is gone");
    assert.notEqual(board.body.code, "board_not_found");
  } finally {
    await backend.stop();
  }
});

test("a failed single-project lookup is an outage, not a deleted project", async () => {
  const backend = await startBackend();
  try {
    backend.db.table("GET", "projects", { status: 500, body: { code: "57014", message: "canceling statement due to statement timeout" } });
    const project = await backend.get(`/projects/${PROJECT_ID}`);
    assert.equal(project.status, 503, "a database error must not tell the owner their project is gone");
    assert.notEqual(project.body.code, "project_not_found");
  } finally {
    await backend.stop();
  }
});

test("a single project that does not exist is still a 404 with its code", async () => {
  const backend = await startBackend();
  try {
    backend.db.table("GET", "projects", { status: 200, body: [] });
    const project = await backend.get(`/projects/${PROJECT_ID}`);
    assert.equal(project.status, 404);
    assert.equal(project.body.code, "project_not_found");
  } finally {
    await backend.stop();
  }
});

test("the developer top-up reports an outage as an outage, and a missing account as a missing account", async () => {
  // The route only exists outside production and only with an explicit flag plus a matching
  // ADMIN_SECRET, so the test turns it on deliberately instead of relying on the default.
  const adminSecret = "test-admin-secret-that-is-long-enough";
  const backend = await startBackend({ extraEnv: { ENABLE_DEV_TOPUP: "true", ADMIN_SECRET: adminSecret } });
  const topUp = (email) => backend.base && fetch(`${backend.base}/credits/dev-topup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminSecret, email, amount: 5 }),
  }).then(async (response) => ({ status: response.status, body: JSON.parse(await response.text() || "null") }));
  try {
    backend.db.table("GET", "users", { status: 500, body: { code: "57014", message: "canceling statement due to statement timeout" } });
    const outage = await topUp("owner@example.com");
    assert.equal(outage.status, 503, "an operator must not be told the account is missing when the database failed");
    assert.notEqual(outage.body.code, "user_not_found");

    backend.db.table("GET", "users", { status: 200, body: [] });
    const missing = await topUp("nobody@example.com");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, "user_not_found");
  } finally {
    await backend.stop();
  }
});

test("the developer top-up refuses a wrong secret before looking anybody up", async () => {
  const backend = await startBackend({ extraEnv: { ENABLE_DEV_TOPUP: "true", ADMIN_SECRET: "test-admin-secret-that-is-long-enough" } });
  try {
    const response = await fetch(`${backend.base}/credits/dev-topup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminSecret: "wrong-secret-of-the-same-length!!!", email: "owner@example.com", amount: 5 }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(
      backend.db.requests.filter((entry) => entry.path === "/rest/v1/users" && !String(entry.query.select || "").includes("token_version")),
      [],
      "a rejected secret must not reach a user lookup"
    );
  } finally {
    await backend.stop();
  }
});
test("creating a project takes the owner from the token, never from the request", async () => {
  const backend = await startBackend();
  try {
    const created = await backend.send("POST", "/projects", {
      // A client that sends an owner must not be able to write into another account.
      user_id: OTHER_USER_ID,
      website_url: "https://example.com",
      niche: "home",
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.id, PROJECT_ID);
    assert.equal(Object.hasOwn(created.body, "user_id"), false, "the owner column must not come back to the client");

    const insert = backend.db.requests.find((entry) => entry.method === "POST" && entry.path === "/rest/v1/projects");
    assert.ok(insert, "the project was not inserted");
    const payload = JSON.parse(insert.body);
    assert.equal(payload.user_id, USER_ID, "the insert must carry the token's user, not the body's");
  } finally {
    await backend.stop();
  }
});

test("a project website that is not http(s) is refused before any insert", async () => {
  const backend = await startBackend();
  try {
    const created = await backend.send("POST", "/projects", { website_url: "javascript:alert(1)" });
    assert.equal(created.status, 422);
    assert.deepEqual(
      backend.db.requests.filter((entry) => entry.method === "POST" && entry.path === "/rest/v1/projects"),
      [],
      "a rejected URL must not reach the database"
    );
  } finally {
    await backend.stop();
  }
});

test("a board cannot be created inside somebody else's project", async () => {
  const backend = await startBackend();
  try {
    backend.db.table("GET", "projects", { status: 200, body: [] });
    const created = await backend.send("POST", "/boards", {
      project_id: PROJECT_ID,
      title: "Чужая доска",
    });
    assert.equal(created.status, 404);
    assert.equal(created.body.code, "project_not_found");
    assert.deepEqual(
      backend.db.requests.filter((entry) => entry.method === "POST" && entry.path === "/rest/v1/boards"),
      [],
      "no board may be written into a project the caller does not own"
    );
  } finally {
    await backend.stop();
  }
});

test("a board created with an idempotency key converges, and the same key with another title is a conflict", async () => {
  const backend = await startBackend();
  const key = "88888888-8888-4888-8888-888888888888";
  try {
    backend.db.table("GET", "projects", { status: 200, body: [{ id: PROJECT_ID }] });

    // A real `ignoreDuplicates` upsert leaves the existing row untouched, so the read-back carries
    // the fingerprint of the FIRST create, not of the retry. That is what makes a retry with other
    // content detectable at all.
    let storedFingerprint = null;
    let storedTitle = "Доска";
    backend.db.table("POST", "boards", ({ body }) => {
      const payload = JSON.parse(body || "{}");
      if (storedFingerprint === null) storedFingerprint = payload.create_request_fingerprint;
      return { status: 201, body: [{ id: BOARD_ID, ...payload }] };
    });
    backend.db.table("GET", "boards", () => ({
      status: 200,
      body: [{ id: BOARD_ID, project_id: PROJECT_ID, title: storedTitle, create_request_id: key, create_request_fingerprint: storedFingerprint }],
    }));

    const first = await backend.send("POST", "/boards", { project_id: PROJECT_ID, title: "Доска", create_request_id: key });
    assert.equal(first.status, 200);
    assert.equal(
      Object.hasOwn(first.body, "create_request_fingerprint"),
      false,
      "the internal fingerprint is not client data"
    );

    const retry = await backend.send("POST", "/boards", { project_id: PROJECT_ID, title: "Доска", create_request_id: key });
    assert.equal(retry.status, 200, "a retry of the same logical create must return the same board");

    storedTitle = "Другая доска";
    const conflicting = await backend.send("POST", "/boards", { project_id: PROJECT_ID, title: "Другая доска", create_request_id: key });
    assert.equal(conflicting.status, 409, "the same key with other content must not create or return another board");
    assert.match(conflicting.body.error, /уже использован/);
  } finally {
    await backend.stop();
  }
});

test("a board update cannot carry fields the builder does not allow", async () => {
  const backend = await startBackend();
  try {
    backend.db.ownedBy = USER_ID;
    const patched = await backend.send("PATCH", `/boards/${BOARD_ID}`, {
      title: "Новое имя",
      // Mass assignment: neither owner nor project may be reassigned through a patch.
      user_id: OTHER_USER_ID,
      project_id: "99999999-9999-4999-8999-999999999999",
    });
    assert.equal(patched.status, 422);
    assert.match(patched.body.error, /Неизвестные поля/);
    assert.deepEqual(
      backend.db.requests.filter((entry) => entry.method === "PATCH"),
      [],
      "a refused patch must not reach the database"
    );
  } finally {
    await backend.stop();
  }
});

test("an allowed board patch is applied only to the caller's board", async () => {
  const backend = await startBackend();
  try {
    backend.db.ownedBy = USER_ID;
    backend.db.table("PATCH", "boards", { status: 200, body: [{ id: BOARD_ID, title: "Новое имя" }] });
    const patched = await backend.send("PATCH", `/boards/${BOARD_ID}`, { title: "Новое имя" });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.id, BOARD_ID);

    const update = backend.db.requests.find((entry) => entry.method === "PATCH");
    assert.ok(update);
    assert.deepEqual(JSON.parse(update.body), { title: "Новое имя" });
    assert.equal(update.query.id, `eq.${BOARD_ID}`);
  } finally {
    await backend.stop();
  }
});

test("a foreign board cannot be patched at all", async () => {
  const backend = await startBackend();
  try {
    backend.db.ownedBy = OTHER_USER_ID;
    const patched = await backend.send("PATCH", `/boards/${BOARD_ID}`, { title: "Захват" });
    assert.equal(patched.status, 404);
    assert.equal(patched.body.code, "board_not_found");
    assert.deepEqual(backend.db.requests.filter((entry) => entry.method === "PATCH"), []);
  } finally {
    await backend.stop();
  }
});

test("a pin status that is not one of the two decisions is refused", async () => {
  const backend = await startBackend();
  const pinId = "55555555-5555-4555-8555-555555555555";
  try {
    backend.db.ownedBy = USER_ID;
    for (const status of ["published", "deleted", "", null]) {
      const answer = await backend.send("POST", `/pins/${pinId}/status`, { status });
      assert.equal(answer.status, 422, `status ${JSON.stringify(status)} was accepted`);
    }
    assert.deepEqual(
      backend.db.requests.filter((entry) => entry.method === "PATCH"),
      [],
      "an invalid status must not be written"
    );
  } finally {
    await backend.stop();
  }
});

test("a pin of another account cannot be approved or rejected", async () => {
  const backend = await startBackend();
  try {
    backend.db.ownedBy = OTHER_USER_ID;
    const answer = await backend.send("POST", "/pins/55555555-5555-4555-8555-555555555555/status", { status: "approved" });
    assert.equal(answer.status, 404);
    assert.equal(answer.body.code, "pin_not_found");
    assert.deepEqual(
      backend.db.requests.filter((entry) => entry.method === "PATCH"),
      [],
      "a foreign pin must not be updated"
    );
  } finally {
    await backend.stop();
  }
});
