"use strict";

const bcrypt = require("bcryptjs");
const { logError, logWarning } = require("./safeLogger");
const defaultSupabase = require("./supabase");
const { httpError } = require("./validate");
const { isAccountDeletionWorkerEnabled } = require("./accountDeletionWorkerGate");

// Version 2 adds the generation, payment, publishing and deletion sections that
// version 1 omitted. The bump is deliberate: a consumer can tell a file that
// should contain them from one produced before they existed, instead of guessing
// from the presence of a key.
const EXPORT_FORMAT_VERSION = 2;

// Guard against a timing oracle when the account does not exist.
const DUMMY_HASH = bcrypt.hashSync("invalid-placeholder-password", 10);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Column allowlists. Anything not listed here is never exported, even if new
// sensitive columns are added to the table later. OAuth tokens, password
// hashes and internal counters are deliberately absent.
const PROFILE_COLUMNS = [
  "id",
  "email",
  "name",
  "surname",
  "credits_balance",
  "subscription_tier",
  "tariff_plan",
  "tariff_period_end",
  "onboarded",
  "email_verified",
  "preferred_language",
  "created_at",
  "account_status",
  "deletion_requested_at",
];

const PINTEREST_ACCOUNT_COLUMNS = [
  "id",
  "pinterest_user_id",
  "username",
  "scopes",
  "expires_at",
  "created_at",
  "updated_at",
];

// Generation output is user-authored content: it was produced from the user's own
// brief and is stored on the user's boards. It has to appear in the export.
const GENERATION_REQUEST_COLUMNS = [
  "id",
  "board_id",
  "status",
  "pins",
  "error_code",
  "created_at",
  "updated_at",
];

// The per-image journal keeps the exact prompt that was sent to the provider.
// provider_idempotency_key, provider_task_id and provider_price stay private.
const GENERATION_TASK_COLUMNS = [
  "id",
  "generation_request_id",
  "board_id",
  "task_index",
  "title",
  "description",
  "prompt",
  "model",
  "aspect_ratio",
  "status",
  "storage_url",
  "error_code",
  "created_at",
  "updated_at",
];

// claim_token is a live lease credential and must never leave the database.
const REGENERATION_REQUEST_COLUMNS = [
  "id",
  "pin_id",
  "status",
  "model",
  "prompt",
  "result_pin",
  "error_code",
  "created_at",
  "updated_at",
];

const CREDIT_RESERVATION_COLUMNS = [
  "id",
  "amount",
  "status",
  "created_at",
  "updated_at",
];

// Token counts are the user's own consumption. Provider cost in rubles is our
// cost of goods and stays out of the customer-facing export.
const TEXT_USAGE_COLUMNS = [
  "id",
  "provider_model",
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "cached_prompt_tokens",
  "cache_write_tokens",
  "usage_status",
  "created_at",
];

// The payment link itself (result) is re-creatable and can contain provider
// identifiers, so only the request outcome is exported.
const PAYMENT_REQUEST_COLUMNS = [
  "id",
  "request_kind",
  "status",
  "error_code",
  "created_at",
  "updated_at",
];

const PAYMENT_DECISION_COLUMNS = [
  "receipt_id",
  "local_payment_kind",
  "local_payment_id",
  "decision",
  "safe_reason_code",
  "decided_at",
];

const PUBLISH_ATTEMPT_COLUMNS = [
  "id",
  "pin_id",
  "pinterest_board_id",
  "status",
  "attempt_count",
  "pinterest_pin_id",
  "last_error",
  "created_at",
  "updated_at",
];

// token_version is a session counter, not user data: exporting it would hand out
// the current fencing value of the account.
const DELETION_REQUEST_COLUMNS = [
  "state",
  "confirmation_method",
  "requested_at",
  "completed_at",
  "created_at",
];

function pickColumns(row, columns) {
  const out = {};
  for (const column of columns) {
    if (row && Object.prototype.hasOwnProperty.call(row, column)) {
      out[column] = row[column];
    }
  }
  return out;
}

function requireUserId(userId) {
  if (typeof userId !== "string" || !UUID_RE.test(userId)) {
    throw httpError(422, "Некорректный идентификатор аккаунта");
  }
  return userId;
}

async function selectRows(query, pageSize = 1000, orderBy = "id") {
  // PostgREST applies a default row cap. Stable ordering plus explicit ranges
  // ensures account exports never silently omit records after the first page.
  // orderBy is explicit because a few user-owned tables have no `id` column
  // (payment_entitlement_decisions is keyed by receipt_id).
  const orderedQuery = typeof query.order === "function"
    ? query.order(orderBy, { ascending: true })
    : query;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = typeof orderedQuery.range === "function"
      ? await orderedQuery.range(offset, offset + pageSize - 1)
      : await orderedQuery;
    if (error) throw error;
    if (!Array.isArray(data)) {
      const invalidPage = new Error("account export query returned an invalid page");
      invalidPage.code = "invalid_export_page";
      throw invalidPage;
    }
    rows.push(...data);
    if (typeof orderedQuery.range !== "function" || data.length < pageSize) return rows;
  }
}

// Keep PostgREST filter payloads bounded for accounts with many boards/projects.
async function selectRowsByValues(client, table, column, values, chunkSize = 200) {
  const rows = [];
  for (let offset = 0; offset < values.length; offset += chunkSize) {
    const chunk = values.slice(offset, offset + chunkSize);
    rows.push(...await selectRows(client.from(table).select("*").in(column, chunk)));
  }
  return rows;
}

/** Load one export section without failing the whole export when a single
 *  table is missing or temporarily unreadable. Returns [] on failure and
 *  records the section name so the caller can report partial data. */
async function loadSection(name, loader, degraded) {
  try {
    return await loader();
  } catch (e) {
    logWarning("account.export_section_unavailable", e);
    degraded.push(name);
    return [];
  }
}

/**
 * Build a self-service export of everything the account owns.
 * Secret material (OAuth access/refresh tokens, password hash, session
 * counters) is never included. Sections that cannot be read are reported in
 * `degradedSections` instead of silently returning an empty list.
 */
async function buildAccountExport(userId, client = defaultSupabase) {
  const id = requireUserId(userId);
  const degraded = [];

  const profileRows = await loadSection("account", async () => {
    const rows = await selectRows(client.from("users").select("*").eq("id", id).limit(1));
    return rows.map((row) => pickColumns(row, PROFILE_COLUMNS));
  }, degraded);

  if (!profileRows.length) {
    if (degraded.includes("account")) {
      throw httpError(503, "Не удалось прочитать аккаунт для экспорта — попробуйте позже");
    }
    throw httpError(404, "Аккаунт не найден");
  }

  const projects = await loadSection("projects", () =>
    selectRows(client.from("projects").select("*").eq("user_id", id)), degraded);

  const projectIds = projects.map((p) => p.id).filter(Boolean);
  const projectsUnavailable = degraded.includes("projects");
  const boards = projectIds.length
    ? await loadSection("boards", () =>
        selectRowsByValues(client, "boards", "project_id", projectIds), degraded)
    : [];

  // An empty parent list is only a valid empty result when the parent section
  // was read successfully. Otherwise downstream sections are unknown, not empty.
  if (!projectIds.length && projectsUnavailable) degraded.push("boards");

  const boardIds = boards.map((b) => b.id).filter(Boolean);
  const boardsUnavailable = degraded.includes("boards");
  const pins = boardIds.length
    ? await loadSection("pins", () =>
        selectRowsByValues(client, "pins", "board_id", boardIds), degraded)
    : [];

  if (!boardIds.length && boardsUnavailable) degraded.push("pins");

  const creditTransactions = await loadSection("creditTransactions", () =>
    selectRows(client.from("credit_transactions").select("*").eq("user_id", id)), degraded);

  const subscriptions = await loadSection("subscriptions", () =>
    selectRows(client.from("subscriptions").select("*").eq("user_id", id)), degraded);

  const creditPurchases = await loadSection("creditPurchases", () =>
    selectRows(client.from("credit_purchases").select("*").eq("user_id", id)), degraded);

  const pinterestAccounts = await loadSection("pinterestAccounts", async () => {
    const rows = await selectRows(
      client.from("pinterest_accounts").select("*").eq("user_id", id)
    );
    return rows.map((row) => pickColumns(row, PINTEREST_ACCOUNT_COLUMNS));
  }, degraded);

  const pinterestPublications = await loadSection("pinterestPublications", () =>
    selectRows(client.from("pinterest_publications").select("*").eq("user_id", id)), degraded);

  const pinSchedules = await loadSection("pinSchedules", () =>
    selectRows(client.from("pin_schedules").select("*").eq("user_id", id)), degraded);

  const reviewQueue = await loadSection("reviewQueue", () =>
    selectRows(client.from("pin_review_queue").select("*").eq("user_id", id)), degraded);

  // Everything below was missing from the export while the frontend still labelled
  // the file as the account's complete data. Prompts and generated copy are user
  // content; payment and deletion records are the user's own history.
  const generationRequests = await loadSection("generationRequests", async () => {
    const rows = await selectRows(
      client.from("pin_generation_requests").select("*").eq("user_id", id)
    );
    return rows.map((row) => pickColumns(row, GENERATION_REQUEST_COLUMNS));
  }, degraded);

  const generationTasks = await loadSection("generationTasks", async () => {
    const rows = await selectRows(
      client.from("pin_generation_tasks").select("*").eq("user_id", id), 500
    );
    return rows.map((row) => pickColumns(row, GENERATION_TASK_COLUMNS));
  }, degraded);

  const regenerationRequests = await loadSection("regenerationRequests", async () => {
    const rows = await selectRows(
      client.from("pin_regeneration_requests").select("*").eq("user_id", id)
    );
    return rows.map((row) => pickColumns(row, REGENERATION_REQUEST_COLUMNS));
  }, degraded);

  const generationCreditReservations = await loadSection("generationCreditReservations", async () => {
    const rows = await selectRows(
      client.from("pin_generation_credit_reservations").select("*").eq("user_id", id)
    );
    return rows.map((row) => pickColumns(row, CREDIT_RESERVATION_COLUMNS));
  }, degraded);

  const generationTextUsage = await loadSection("generationTextUsage", async () => {
    const rows = await selectRows(
      client.from("pin_generation_text_usage").select("*").eq("user_id", id)
    );
    return rows.map((row) => pickColumns(row, TEXT_USAGE_COLUMNS));
  }, degraded);

  const paymentRequests = await loadSection("paymentRequests", async () => {
    const rows = await selectRows(
      client.from("payment_creation_requests").select("*").eq("user_id", id)
    );
    return rows.map((row) => pickColumns(row, PAYMENT_REQUEST_COLUMNS));
  }, degraded);

  const paymentDecisions = await loadSection("paymentDecisions", async () => {
    const rows = await selectRows(
      client.from("payment_entitlement_decisions").select("*").eq("user_id", id), 1000, "receipt_id"
    );
    return rows.map((row) => pickColumns(row, PAYMENT_DECISION_COLUMNS));
  }, degraded);

  const publishAttempts = await loadSection("publishAttempts", async () => {
    const rows = await selectRows(
      client.from("pinterest_publish_attempts").select("*").eq("user_id", id)
    );
    return rows.map((row) => pickColumns(row, PUBLISH_ATTEMPT_COLUMNS));
  }, degraded);

  const deletionRequests = await loadSection("deletionRequests", async () => {
    const rows = await selectRows(
      client.from("account_deletion_requests").select("*").eq("user_id", id)
    );
    return rows.map((row) => pickColumns(row, DELETION_REQUEST_COLUMNS));
  }, degraded);

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    account: profileRows[0] || null,
    projects,
    boards,
    pins,
    creditTransactions,
    subscriptions,
    creditPurchases,
    pinterestAccounts,
    pinterestPublications,
    pinSchedules,
    reviewQueue,
    generationRequests,
    generationTasks,
    regenerationRequests,
    generationCreditReservations,
    generationTextUsage,
    paymentRequests,
    paymentDecisions,
    publishAttempts,
    deletionRequests,
    degradedSections: degraded,
  };
}

function mapDeletionRpcError(error) {
  const message = (error && error.message) || "";
  if (/user not found/i.test(message)) {
    return httpError(404, "Аккаунт не найден");
  }
  if (/account already deleted/i.test(message)) {
    return httpError(409, "Аккаунт уже удалён");
  }
  if (/reauthentication expired|account is not active/i.test(message)) {
    return httpError(409, "Состояние аккаунта изменилось — обновите страницу и повторите действие");
  }
  if (/unsupported confirmation method/i.test(message)) {
    return httpError(422, "Некорректный способ подтверждения");
  }
  // Function missing means migration 127 has not been applied yet.
  if (/could not find the function|does not exist|PGRST202/i.test(message)) {
    return httpError(503, "Удаление аккаунта ещё не активировано — попробуйте позже");
  }
  return httpError(503, "Не удалось создать запрос на удаление — попробуйте позже");
}

/**
 * Accept a self-service deletion request. Requires a fresh password
 * confirmation, then fences the account: the request RPC bumps token_version
 * (invalidating every existing session) and marks the account as
 * deletion_pending. No user content is removed here.
 */
async function requestAccountDeletion(
  { userId, password, confirmationMethod = "password_reauth" },
  client = defaultSupabase,
  workerEnabled = isAccountDeletionWorkerEnabled()
) {
  // Do not fence the account or accept a durable deletion job when no worker
  // is enabled to process it. This is fail-closed for every caller, not just
  // the HTTP route.
  if (workerEnabled !== true) {
    throw httpError(503, "Удаление аккаунта временно недоступно — попробуйте позже");
  }
  const id = requireUserId(userId);

  if (typeof password !== "string" || !password) {
    throw httpError(422, "Введите пароль для подтверждения");
  }
  if (confirmationMethod !== "password_reauth") {
    throw httpError(422, "Некорректный способ подтверждения");
  }

  const { data: user, error } = await client
    .from("users")
    .select("id, password_hash, token_version")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logError("account.deletion_lookup_failed", error);
    throw httpError(503, "Не удалось проверить аккаунт — попробуйте позже");
  }
  // 403 (not 401): a wrong password here must not sign the user out of the app.
  const isValid = await bcrypt.compare(password, (user && user.password_hash) || DUMMY_HASH);
  if (!user || !isValid) {
    throw httpError(403, "Неверный пароль");
  }

  const { data, error: rpcError } = await client.rpc("request_account_deletion", {
    p_user_id: id,
    p_confirmation_method: confirmationMethod,
    p_expected_token_version: Number(user.token_version ?? 0),
  });
  if (rpcError) {
    const mapped = mapDeletionRpcError(rpcError);
    if (mapped.httpStatus >= 500) logError("account.deletion_request_failed", rpcError, mapped.httpStatus);
    throw mapped;
  }

  return {
    ok: true,
    request: {
      requestId: data && data.requestId,
      state: data && data.state,
      requestedAt: data && data.requestedAt,
      alreadyRequested: Boolean(data && data.alreadyRequested),
    },
  };
}

module.exports = {
  EXPORT_FORMAT_VERSION,
  loadSection,
  pickColumns,
  buildAccountExport,
  requestAccountDeletion,
  mapDeletionRpcError,
};
