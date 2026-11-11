"use strict";

const bcrypt = require("bcryptjs");
const { logError, logWarning } = require("./safeLogger");
const defaultSupabase = require("./supabase");
const { httpError } = require("./validate");

const EXPORT_FORMAT_VERSION = 1;

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
  "disconnected_at",
];

// Explicit export projections prevent newly added internal/provider columns
// from becoming public in an account archive by accident.
const PROJECT_EXPORT_COLUMNS = [
  "id", "user_id", "website_url", "niche", "tone", "goal", "language",
  "site_summary", "analyzed_at", "created_at",
];
const BOARD_EXPORT_COLUMNS = [
  "id", "project_id", "title", "description", "status", "cover_url",
  "category", "created_at",
];
const PIN_EXPORT_COLUMNS = [
  "id", "board_id", "image_url", "title", "description", "status",
  "model_used", "credits_cost", "scheduled_date", "aspect_ratio", "created_at",
];
const CREDIT_TRANSACTION_EXPORT_COLUMNS = [
  "id", "user_id", "amount", "type", "description", "created_at",
];
const SUBSCRIPTION_EXPORT_COLUMNS = [
  "id", "user_id", "plan", "status", "amount", "currency",
  "period_start", "period_end", "created_at",
];
const CREDIT_PURCHASE_EXPORT_COLUMNS = [
  "id", "user_id", "package_id", "pack_title", "credits", "status",
  "amount", "currency", "paid_at", "created_at",
];
const PINTEREST_PUBLICATION_EXPORT_COLUMNS = [
  "id", "user_id", "pin_id", "pinterest_account_id", "pinterest_pin_id", "pinterest_board_id", "created_at",
];
const PIN_SCHEDULE_EXPORT_COLUMNS = [
  "id", "user_id", "pin_id", "scheduled_at", "timezone", "destination_url",
  "pinterest_board_id", "pinterest_account_id", "status", "pinterest_pin_id", "published_at",
  "created_at", "updated_at", "snapshot_title", "snapshot_description",
  "snapshot_image_url", "snapshot_destination_url",
];
const REVIEW_QUEUE_EXPORT_COLUMNS = [
  "id", "user_id", "pin_id", "payload", "created_at", "updated_at",
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

const REVIEW_QUEUE_PAYLOAD_COLUMNS = [
  "id", "title", "description", "boardName", "boardId", "imageUrl", "image_url",
  "aspectRatio", "reason", "trendMetric", "scheduledTime", "scheduledDate",
  "destinationUrl", "accountHandle", "accountId", "pinId",
];

function sanitizeReviewQueuePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return pickColumns(payload, REVIEW_QUEUE_PAYLOAD_COLUMNS);
}

function requireUserId(userId) {
  if (typeof userId !== "string" || !UUID_RE.test(userId)) {
    throw httpError(422, "Некорректный идентификатор аккаунта");
  }
  return userId;
}

// PostgREST applies a default row cap. Page every export section so a
// successful export never silently omits records after the first 1,000 rows.
async function selectRows(query, pageSize = 1000) {
  // Stable ordering keeps page boundaries deterministic for the duration
  // of this export. The account data remains read-only during export.
  const orderedQuery = typeof query.order === "function"
    ? query.order("id", { ascending: true })
    : query;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await orderedQuery.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

// Keep PostgREST URL/filter payloads bounded when an account owns many
// projects or boards. A failed chunk rejects the section rather than silently
// returning a partial export.
async function selectRowsByValues(client, table, column, values, columns, chunkSize = 200) {
  const rows = [];
  for (let offset = 0; offset < values.length; offset += chunkSize) {
    const chunk = values.slice(offset, offset + chunkSize);
    const page = await selectRows(
      client.from(table).select(columns.join(", ")).in(column, chunk)
    );
    rows.push(...page);
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
    const { data, error } = await client.from("users").select(PROFILE_COLUMNS.join(", ")).eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? [pickColumns(data, PROFILE_COLUMNS)] : [];
  }, degraded);

  if (!profileRows.length) {
    if (degraded.includes("account")) {
      throw httpError(503, "Не удалось прочитать аккаунт для экспорта — попробуйте позже");
    }
    throw httpError(404, "Аккаунт не найден");
  }

  const projects = await loadSection("projects", () =>
    selectRows(client.from("projects").select(PROJECT_EXPORT_COLUMNS.join(", ")).eq("user_id", id)), degraded);

  const projectIds = projects.map((p) => p.id).filter(Boolean);
  const projectsUnavailable = degraded.includes("projects");
  const boards = projectIds.length
    ? await loadSection("boards", () =>
        selectRowsByValues(client, "boards", "project_id", projectIds, BOARD_EXPORT_COLUMNS), degraded)
    : [];

  // An empty parent list is only a valid empty result when the parent section
  // was read successfully. Otherwise downstream sections are unknown, not empty.
  if (!projectIds.length && projectsUnavailable) degraded.push("boards");

  const boardIds = boards.map((b) => b.id).filter(Boolean);
  const boardsUnavailable = degraded.includes("boards");
  const pins = boardIds.length
    ? await loadSection("pins", () =>
        selectRowsByValues(client, "pins", "board_id", boardIds, PIN_EXPORT_COLUMNS), degraded)
    : [];

  if (!boardIds.length && boardsUnavailable) degraded.push("pins");

  const creditTransactions = await loadSection("creditTransactions", () =>
    selectRows(client.from("credit_transactions").select(CREDIT_TRANSACTION_EXPORT_COLUMNS.join(", ")).eq("user_id", id)), degraded);

  const subscriptions = await loadSection("subscriptions", () =>
    selectRows(client.from("subscriptions").select(SUBSCRIPTION_EXPORT_COLUMNS.join(", ")).eq("user_id", id)), degraded);

  const creditPurchases = await loadSection("creditPurchases", () =>
    selectRows(client.from("credit_purchases").select(CREDIT_PURCHASE_EXPORT_COLUMNS.join(", ")).eq("user_id", id)), degraded);

  const pinterestAccounts = await loadSection("pinterestAccounts", async () => {
    const rows = await selectRows(
      client.from("pinterest_accounts").select(PINTEREST_ACCOUNT_COLUMNS.join(", ")).eq("user_id", id)
    );
    return rows.map((row) => pickColumns(row, PINTEREST_ACCOUNT_COLUMNS));
  }, degraded);

  const pinterestPublications = await loadSection("pinterestPublications", () =>
    selectRows(client.from("pinterest_publications").select(PINTEREST_PUBLICATION_EXPORT_COLUMNS.join(", ")).eq("user_id", id)), degraded);

  const pinSchedules = await loadSection("pinSchedules", () =>
    selectRows(client.from("pin_schedules").select(PIN_SCHEDULE_EXPORT_COLUMNS.join(", ")).eq("user_id", id)), degraded);

  const reviewQueue = await loadSection("reviewQueue", async () => {
    const rows = await selectRows(
      client.from("pin_review_queue").select(REVIEW_QUEUE_EXPORT_COLUMNS.join(", ")).eq("user_id", id)
    );
    return rows.map((row) => ({
      ...row,
      payload: sanitizeReviewQueuePayload(row.payload),
    }));
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
  client = defaultSupabase
) {
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
  sanitizeReviewQueuePayload,
  buildAccountExport,
  requestAccountDeletion,
  mapDeletionRpcError,
};
