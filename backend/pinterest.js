// Pinterest API v5: OAuth 2.0 (вход через Pinterest) и публикация пинов.
// Документация:
//   авторизация: https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/
//   токен:       https://developers.pinterest.com/docs/api/v5/oauth-token/
//   создание пина: https://developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/
//
// Правила этого файла:
//   1. Токены Pinterest живут только на сервере. Наружу уходят лишь username и дата истечения.
//   2. Если PINTEREST_* не заданы — все роуты отвечают 503, остальной сервис работает как обычно.
//   3. Один локальный пин публикуется не более одного раза в каждый Pinterest-аккаунт (account-scoped journal).

const axios = require("axios");
const express = require("express");
const {
  pinterestReadLimiter,
  pinterestPublishLimiter,
  pinterestOAuthStartLimiter,
  pinterestOAuthCallbackLimiter,
  pinterestWorkerLimiter,
} = require("./pinterestRateLimit");
const { executeWithAccountToken, getPinterestRetryDelayMs } = require("./pinterestAccountRequest");
const { fetchAllPinterestBoards } = require("./pinterestBoardsPagination");
const { toPublicPinterestAccount, toDisconnectedPinterestAccount, isPinterestReauthRequired } = require("./pinterestPublicAccount");
const { isCommittedTokenRefresh, hasActiveRefreshLease, isExplicitRefreshRateLimit } = require("./pinterestRefreshRecovery");
const { decodePinterestAccountRecord } = require("./pinterestAccountRecord");
const crypto = require("crypto");
const { hasEncryptionKey, isEncryptedToken, isEncryptedWithActiveKey, encryptToken, decryptToken } = require("./pinterestTokenCrypto");
const jwt = require("jsonwebtoken");
const supabase = require("./supabase");
const { getTariffState, normalizePlan, GENERATION_PLANS } = require("./tariff");
const { httpError } = require("./validate");
const { getPinterestTokenExpiresAt } = require("./pinterestOAuth");
const { buildScheduleWorkerFailureState, hasCompleteScheduleClaimIdentity, hasMatchingScheduleAttemptIdentity, isScheduleClaimUpdateConfirmed, resolvePublishedReservation, resolvePinScheduleSnapshot, isPinterestPublishOutcomeUnknown, matchesConfirmedPublicationLedger, persistPublishFailureJournal, createScheduleClaimHeartbeat } = require("./pinterestSchedule");
const {
  createBrowserBinding,
  readCookie,
  matchesBrowserBinding,
  serializeBindingCookie,
  clearBindingCookie,
} = require("./pinterestOAuthBrowserBinding");

const AUTHORIZE_URL = "https://www.pinterest.com/oauth/";
const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const API_BASE = "https://api.pinterest.com/v5";

// Минимально необходимые права: читать доски, публиковать пины, читать свой аккаунт.
const SCOPES = ["boards:read", "boards:write", "pins:read", "pins:write", "user_accounts:read"];

const TIMEOUT_MS = 10000;
const STATE_TTL = "15m";

// ---------- конфигурация ----------

function clientId() {
  return String(process.env.PINTEREST_CLIENT_ID || "").trim();
}
function clientSecret() {
  return String(process.env.PINTEREST_CLIENT_SECRET || "").trim();
}
function redirectUri() {
  return String(process.env.PINTEREST_REDIRECT_URI || "").trim();
}
function isConfigured() {
  return !!(clientId() && clientSecret() && redirectUri() && hasEncryptionKey());
}
function requireConfigured() {
  if (!isConfigured()) {
    throw httpError(
      503,
      "Интеграция Pinterest не настроена: проверьте PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET, PINTEREST_REDIRECT_URI и задайте PINTEREST_TOKEN_ENCRYPTION_KEY (32 случайных байта, base64 или 64 символа hex) в переменных окружения backend"
    );
  }
}

/** Basic-авторизация приложения: base64(client_id:client_secret) без переводов строк */
function basicAuth() {
  return Buffer.from(`${clientId()}:${clientSecret()}`, "utf8").toString("base64");
}

/** Куда вернуть браузер после согласия на Pinterest */
function frontendBase() {
  const raw = String(process.env.FRONTEND_URL || "https://pinposy.com");
  return raw.split(",")[0].trim().replace(/\/+$/, "");
}

// ---------- state (защита OAuth-редиректа от подмены) ----------

/** Короткоживущий подписанный state: userId + версия сессии, срок 15 минут. */
function createState(userId, tokenVersion = 0, attemptId, generation, browserBindingHash) {
  return jwt.sign(
    {
      userId,
      tokenVersion: Number(tokenVersion) || 0,
      attemptId,
      generation: Number(generation),
      browserBindingHash,
      purpose: "pinterest_oauth",
    },
    process.env.JWT_SECRET,
    { expiresIn: STATE_TTL }
  );
}

function readStateClaims(state) {
  try {
    const decoded = jwt.verify(String(state || ""), process.env.JWT_SECRET);
    if (
      !decoded ||
      decoded.purpose !== "pinterest_oauth" ||
      !decoded.userId ||
      typeof decoded.attemptId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(decoded.attemptId) ||
      !Number.isSafeInteger(Number(decoded.generation)) ||
      Number(decoded.generation) < 1 ||
      typeof decoded.browserBindingHash !== "string" ||
      !/^[a-f0-9]{64}$/i.test(decoded.browserBindingHash)
    ) {
      throw new Error("не тот state");
    }
    return decoded;
  } catch (e) {
    throw httpError(400, "Ссылка подключения Pinterest устарела. Вернитесь в кабинет и нажмите «Подключить» ещё раз.");
  }
}

function readState(state) {
  return readStateClaims(state).userId;
}

// ---------- HTTP к Pinterest ----------

/** Одна попытка запроса: возвращает { ok, status, data } и не бросает на 4xx. */
async function callPinterest(method, path, { token, body } = {}) {
  try {
    const res = await axios({
      method,
      url: `${API_BASE}${path}`,
      data: body,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
    });
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      data: res.data,
      ...(res.status === 429 ? { retryAfterMs: getPinterestRetryDelayMs(res.headers && res.headers["retry-after"]) } : {}),
    };
  } catch (e) {
    // сеть/таймаут
    console.error(`[pinterest] сеть недоступна (${method} ${path}):`, e && e.message);
    throw httpError(502, "Pinterest не отвечает. Попробуйте позже.");
  }
}

/** Текст ошибки Pinterest без утечки токенов. */
function pinterestMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") return data.slice(0, 300);
  return String(data.message || data.error_description || data.error || fallback).slice(0, 300);
}

// ---------- хранилище ----------

async function decodeAccountRecord(data) {
  return decodePinterestAccountRecord(data, {
    supabase,
    hasEncryptionKey,
    isEncryptedToken,
    isEncryptedWithActiveKey,
    encryptToken,
    decryptToken,
  });
}

async function getAccounts(userId, { includeDisconnected = false } = {}) {
  let query = supabase
    .from("pinterest_accounts")
    .select("*")
    .eq("user_id", String(userId));
  if (!includeDisconnected) {
    query = query.is("disconnected_at", null).not("access_token", "is", null);
  }
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return Promise.all((data || []).map(decodeAccountRecord));
}

async function resolveAccount(userId, accountId = null) {
  if (accountId) {
    const account = await getAccount(userId, accountId);
    if (!account) throw httpError(404, "Pinterest-аккаунт не найден или отключён.");
    return account;
  }
  const accounts = await getAccounts(userId);
  if (accounts.length > 1) throw httpError(422, "Выберите Pinterest-аккаунт для этой операции.");
  if (!accounts.length) throw httpError(409, "Pinterest не подключён. Нажмите «Подключить Pinterest» в настройках.");
  return accounts[0];
}

/** Legacy single-account callers select the oldest active connection deterministically. */
async function getAccount(userId, accountId = null) {
  let query = supabase
    .from("pinterest_accounts")
    .select("*")
    .eq("user_id", String(userId))
    .is("disconnected_at", null)
    .not("access_token", "is", null);
  if (accountId) query = query.eq("id", String(accountId));
  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return decodeAccountRecord(data);
}

// ---------- OAuth ----------

async function exchangeCode(code) {
  requireConfigured();
  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: redirectUri(),
    }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth()}`,
        Accept: "application/json",
      },
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
    }
  );
  if (res.status < 200 || res.status >= 300) {
    console.error("[pinterest] обмен кода не удался:", res.status, pinterestMessage(res.data, ""));
    throw httpError(502, "Pinterest не принял код авторизации. Попробуйте подключить заново.");
  }
  return res.data;
}

async function refreshAccessToken(account) {
  requireConfigured();
  if (!account.refresh_token) {
    throw httpError(409, "Pinterest-доступ истёк. Подключите аккаунт заново.");
  }

  // A process-local mutex is not enough: Render may run multiple instances.
  // The database lease serializes refresh-token rotation across all instances.
  const leaseId = crypto.randomUUID();
  const { data: acquired, error: leaseError } = await supabase.rpc("acquire_pinterest_account_refresh_lease", {
    p_user_id: String(account.user_id),
    p_pinterest_account_id: account.id,
    p_lease_id: leaseId,
    p_lease_seconds: 30,
  });
  if (leaseError) {
    console.error("[pinterest] не удалось получить lease обновления токена:", leaseError.message);
    throw httpError(503, "Не удалось безопасно обновить Pinterest-доступ. Попробуйте позже.");
  }

  if (!acquired) {
    // Another instance may already have rotated and saved the credentials.
    // Prefer its fresh access token; never send the same refresh token concurrently.
    const waitUntil = Date.now() + 10000;
    while (Date.now() < waitUntil) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const latest = await getAccount(account.user_id, account.id);
      if (!latest) throw httpError(409, "Pinterest отключён. Подключите аккаунт заново.");
      if (latest.refresh_state === "uncertain") {
        // "uncertain" is also the in-flight marker written by the lease owner
        // before contacting Pinterest. Do not tell a concurrent caller to
        // reconnect while that owner still has a live lease: it may commit the
        // rotated pair moments later. If no live lease remains, the outcome is
        // ambiguous and OAuth reconnect is the only safe recovery.
        const { data: activeLease, error: activeLeaseError } = await supabase
          .from("pinterest_account_refresh_leases")
          .select("lease_until")
          .eq("pinterest_account_id", account.id)
          .eq("user_id", String(account.user_id))
          .gt("lease_until", new Date().toISOString())
          .maybeSingle();
        if (activeLeaseError) {
          console.error("[pinterest] не удалось проверить активный refresh lease:", activeLeaseError.message);
          throw httpError(503, "Не удалось проверить состояние обновления Pinterest-доступа. Повторите запрос позже.");
        }
        if (!hasActiveRefreshLease(activeLease)) {
          throw httpError(409, "Не удалось подтвердить обновление Pinterest-доступа. Подключите аккаунт заново.");
        }
      }
      if (
        latest.access_token !== account.access_token ||
        latest.refresh_token !== account.refresh_token
      ) {
        if (latest.refresh_state === "ready") return latest;
      }
    }
    throw httpError(503, "Обновление Pinterest-доступа уже выполняется на другом сервере. Повторите запрос через несколько секунд.");
  }

  try {
    // Re-read after acquiring the lease: a previous refresh may have completed
    // between our initial 401 and the lease acquisition.
    const latest = await getAccount(account.user_id, account.id);
    if (!latest) throw httpError(409, "Pinterest отключён. Подключите аккаунт заново.");
    if (latest.refresh_state === "uncertain") {
      throw httpError(409, "Не удалось подтвердить обновление Pinterest-доступа. Подключите аккаунт заново.");
    }
    if (
      latest.access_token !== account.access_token ||
      latest.refresh_token !== account.refresh_token
    ) {
      return latest;
    }
    if (!latest.refresh_token) {
      throw httpError(409, "Pinterest-доступ истёк. Подключите аккаунт заново.");
    }

    // Persist an uncertainty fence BEFORE contacting Pinterest. If this process
    // crashes or the response is lost after Pinterest rotates the token, no later
    // instance may replay the old refresh token. A successful token commit clears
    // this marker; OAuth reconnect also clears it through the database trigger.
    const { data: refreshStarted, error: refreshStartError } = await supabase
      .from("pinterest_accounts")
      .update({ refresh_state: "uncertain", updated_at: new Date().toISOString() })
      .eq("id", latest.id)
      .eq("user_id", String(latest.user_id))
      .eq("updated_at", latest.updated_at)
      .eq("refresh_state", "ready")
      .select("updated_at")
      .maybeSingle();
    if (refreshStartError || !refreshStarted) {
      console.error("[pinterest] не удалось зафиксировать начало обновления токена:", refreshStartError && refreshStartError.message);
      throw httpError(503, "Не удалось безопасно начать обновление Pinterest-доступа. Повторите запрос.");
    }

    // Any transport failure after this point is ambiguous. Keep refresh_state
    // as uncertain and require OAuth reconnect rather than replaying an old token.
    let res;
    try {
      res = await axios.post(
        TOKEN_URL,
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: latest.refresh_token,
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${basicAuth()}`,
            Accept: "application/json",
          },
          timeout: TIMEOUT_MS,
          validateStatus: () => true,
        }
      );
    } catch (requestError) {
      // The server may have rotated the token before the connection failed.
      // Do not expose transport details or retry the old credential.
      console.error("[pinterest] refresh response was not received; reauthorization is required:", requestError && requestError.code || "network_error");
      throw httpError(409, "Не удалось подтвердить обновление Pinterest-доступа. Подключите аккаунт заново.");
    }
    if (res.status < 200 || res.status >= 300) {
      console.error("[pinterest] обновление токена не удалось:", res.status);
      if (isExplicitRefreshRateLimit(res.status)) {
        // A received 429 explicitly rejects this refresh attempt. Unlike a
        // timeout or 5xx, it is safe to release the pre-request uncertainty
        // fence so a later user request can retry after the provider's limit.
        // The timestamp predicate prevents this cleanup from touching a
        // reconnect or any newer account state.
        const { data: restored, error: restoreError } = await supabase
          .from("pinterest_accounts")
          .update({ refresh_state: "ready", updated_at: new Date().toISOString() })
          .eq("id", latest.id)
          .eq("user_id", String(latest.user_id))
          .eq("updated_at", refreshStarted.updated_at)
          .eq("refresh_state", "uncertain")
          .select("id")
          .maybeSingle();
        if (restoreError || !restored) {
          console.error("[pinterest] не удалось снять uncertainty fence после явного 429:", restoreError && restoreError.message);
          throw httpError(503, "Pinterest временно ограничил обновление доступа. Состояние подключения не удалось безопасно восстановить; повторите позже.");
        }
        throw httpError(503, "Pinterest временно ограничил частоту обновления доступа. Подождите немного и повторите действие.");
      }
      // Other HTTP failures may still have an ambiguous provider outcome.
      // Keep the uncertainty fence: never replay the old refresh token.
      throw httpError(409, "Не удалось подтвердить обновление Pinterest-доступа. Подключите аккаунт заново.");
    }

    // Do not use the general OAuth upsert here: a reconnect may have replaced
    // the account while this request was in flight. Commit only if both the
    // lease and the account row version still match what we refreshed.
    // Pinterest continuous refresh rotates both credentials. A nominal 2xx
    // response without the complete token set is not safe to commit: preserving
    // the old refresh token and clearing the uncertainty fence could replay it.
    const refreshedAccessToken = res.data && res.data.access_token;
    const refreshedRefreshToken = res.data && res.data.refresh_token;
    const expiresIn = Number(res.data && res.data.expires_in);
    if (
      typeof refreshedAccessToken !== "string" || !refreshedAccessToken.trim() ||
      typeof refreshedRefreshToken !== "string" || !refreshedRefreshToken.trim() ||
      !Number.isFinite(expiresIn) || expiresIn <= 0
    ) {
      console.error("[pinterest] refresh response did not contain a complete rotated token set");
      throw httpError(409, "Pinterest вернул неполный ответ обновления доступа. Подключите аккаунт заново.");
    }
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const { data: committed, error: commitError } = await supabase.rpc("commit_pinterest_account_token_refresh", {
      p_user_id: String(latest.user_id),
      p_pinterest_account_id: latest.id,
      p_lease_id: leaseId,
      p_expected_updated_at: refreshStarted.updated_at,
      p_access_token: encryptToken(refreshedAccessToken),
      p_refresh_token: encryptToken(refreshedRefreshToken),
      p_scopes: res.data.scope || latest.scopes || SCOPES.join(","),
      p_expires_at: expiresAt,
    });
    if (commitError) {
      // The provider has already rotated the token pair. Retry only the
      // idempotent database commit with the SAME response; never call Pinterest
      // again with either refresh token. The lease row serializes this retry
      // against an original RPC that may still be completing.
      console.warn("[pinterest] refresh commit response was ambiguous; retrying the same database commit once");
      const retryCommit = await supabase.rpc("commit_pinterest_account_token_refresh", {
        p_user_id: String(latest.user_id),
        p_pinterest_account_id: latest.id,
        p_lease_id: leaseId,
        p_expected_updated_at: refreshStarted.updated_at,
        p_access_token: encryptToken(refreshedAccessToken),
        p_refresh_token: encryptToken(refreshedRefreshToken),
        p_scopes: res.data.scope || latest.scopes || SCOPES.join(","),
        p_expires_at: expiresAt,
      });

      if (!retryCommit.error && retryCommit.data === true) {
        return getAccount(latest.user_id, latest.id);
      }

      // If the first RPC actually committed, the retry will normally report
      // false because the lease was consumed. Reconcile by comparing stored
      // credentials, not updated_at (the uncertainty fence changes timestamp).
      const reconciled = await getAccount(latest.user_id, latest.id).catch(() => null);
      if (isCommittedTokenRefresh(latest, reconciled)) {
        console.warn("[pinterest] refresh commit recovered after an ambiguous database response");
        return reconciled;
      }
      console.error(
        "[pinterest] не удалось атомарно подтвердить сохранение обновлённых токенов:",
        (retryCommit.error || commitError).message
      );
      throw httpError(503, "Pinterest обновил доступ, но PinPosy не смог подтвердить сохранение токенов. Повторите запрос; если ошибка повторится, подключите Pinterest заново.");
    }
    if (!committed) {
      // OAuth reconnect or lease expiry won the race. Never overwrite its row.
      const current = await getAccount(latest.user_id, latest.id);
      if (isCommittedTokenRefresh(latest, current)) {
        return current;
      }
      throw httpError(503, "Не удалось подтвердить обновление Pinterest-доступа. Повторите запрос.");
    }
    return getAccount(latest.user_id, latest.id);
  } finally {
    try {
      const { error: releaseError } = await supabase.rpc("release_pinterest_account_refresh_lease", {
        p_user_id: String(account.user_id),
        p_pinterest_account_id: account.id,
        p_lease_id: leaseId,
      });
      if (releaseError) {
        // The lease is self-expiring; log without masking the original result.
        console.error("[pinterest] не удалось освободить refresh lease:", releaseError.message);
      }
    } catch (releaseError) {
      // Network-level RPC failures are also safe because the lease expires.
      console.error("[pinterest] ошибка при освобождении refresh lease:", releaseError && releaseError.message);
    }
  }
}

/**
 * Запрос к Pinterest от имени пользователя.
 * 401 -> один раз обновляем токен и повторяем.
 * 429 -> одна безопасная повторная попытка с учётом Retry-After Pinterest.
 */
async function withAccount(userId, handler, accountId = null, options = {}) {
  requireConfigured();
  const account = await resolveAccount(userId, accountId);
  return executeWithAccountToken(account, handler, refreshAccessToken, undefined, options);
}

// ---------- проверка доски ----------

async function verifyPinterestBoard(userId, pinterestBoardId, accountId = null) {
  const boardId = String(pinterestBoardId || "").trim();
  if (!boardId || boardId.length > 128) {
    const error = httpError(422, "Выберите существующую доску Pinterest перед планированием публикации");
    error.retryable = false;
    throw error;
  }

  const boardResult = await withAccount(userId, (token) =>
    callPinterest("GET", `/boards/${encodeURIComponent(boardId)}`, { token }),
    accountId
  );
  if (!boardResult.ok) {
    if ([403, 404].includes(boardResult.status)) {
      const error = httpError(422, "Выбранная доска не найдена или недоступна подключённому Pinterest-аккаунту");
      // This is a GET /boards preflight rejection, before POST /pins. A stale
      // retry_safe journal entry must not turn a deleted/inaccessible board
      // into another automatic retry.
      error.retryable = false;
      throw error;
    }
    throw httpError(502, "Не удалось проверить выбранную доску Pinterest. Попробуйте позже.");
  }

  const verifiedBoardId = String((boardResult.data && boardResult.data.id) || "");
  if (verifiedBoardId !== boardId) {
    const error = httpError(422, "Pinterest не подтвердил принадлежность выбранной доски аккаунту");
    error.retryable = false;
    throw error;
  }
  return verifiedBoardId;
}

// ---------- публикация ----------

/** Пин принадлежит пользователю? pins -> boards -> projects -> user_id */
async function getPinWithOwner(pinId, userId) {
  const { data, error } = await supabase
    .from("pins")
    .select("id, board_id, title, description, image_url, status, boards(id, title, project_id, projects(id, user_id, website_url))")
    .eq("id", pinId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, "Пин не найден");

  const owner = data.boards && data.boards.projects ? data.boards.projects.user_id : null;
  if (String(owner || "") !== String(userId)) throw httpError(404, "Пин не найден");
  return data;
}

async function persistFailedPublishAttempt({ userId, pinId, accountId, message, outcomeUnknown }) {
  try {
    await persistPublishFailureJournal((name, params) => supabase.rpc(name, params), {
      p_user_id: String(userId),
      p_pin_id: pinId,
      p_pinterest_account_id: accountId,
      p_error: String(message || "Pinterest publication failed").slice(0, 500),
      p_outcome_unknown: Boolean(outcomeUnknown),
    });
  } catch (error) {
    console.error("[pinterest] не удалось сохранить исход публикации:", error && error.message);
    throw error;
  }
}
async function publishPin(userId, pinId, pinterestBoardId, scheduledDestinationUrl, accountId = null, scheduleClaim = null, scheduleSnapshot = null) {
  const boardId = String(pinterestBoardId || "").trim();
  if (!boardId) throw httpError(422, "board_id обязателен: выберите доску Pinterest");

  // Проверяем владельца локального пина и доступность доски до резервации.
  const pin = await getPinWithOwner(pinId, userId);
  if (pin.status !== "approved") {
    throw httpError(409, "Публиковать можно только одобренные пины");
  }
  // New schedules use the immutable creative snapshot; legacy rows keep live-pin behavior.
  const resolvedSnapshot = resolvePinScheduleSnapshot(scheduleSnapshot, pin);
  const publishPinData = {
    ...pin,
    title: resolvedSnapshot.title,
    description: resolvedSnapshot.description,
    image_url: resolvedSnapshot.image_url,
  };
  if (!publishPinData.image_url) throw httpError(422, "У пина нет изображения — сначала сгенерируйте картинку");
  const selectedAccount = await resolveAccount(userId, accountId);
  accountId = selectedAccount.id;
  await verifyPinterestBoard(userId, boardId, accountId);

  let destinationUrl = null;
  if (scheduledDestinationUrl) {
    try {
      const parsed = new URL(String(scheduledDestinationUrl).trim());
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid protocol");
      destinationUrl = parsed.toString();
    } catch {
      throw httpError(422, "Ссылка для публикации должна быть корректным HTTP- или HTTPS-адресом");
    }
  }

  // Атомарная резервация в БД не позволяет двум запросам одновременно
  // отправить один и тот же локальный пин в Pinterest.
  const reservationRpc = scheduleClaim
    ? supabase.rpc("begin_scheduled_pinterest_publish", {
        p_user_id: String(userId),
        p_schedule_id: scheduleClaim.scheduleId,
        p_claim_token: scheduleClaim.claimToken,
        p_pin_id: pinId,
        p_pinterest_account_id: accountId,
        p_pinterest_board_id: boardId,
      })
    : supabase.rpc("begin_pinterest_publish_v2", {
        p_user_id: String(userId),
        p_pin_id: pinId,
        p_pinterest_account_id: accountId,
        p_pinterest_board_id: boardId,
      });
  const { data: reservation, error: reservationError } = await reservationRpc;
  if (reservationError) throw reservationError;

  const reservationStatus = reservation && reservation.status;
  if (reservationStatus === "published") {
    const existingPublication = resolvePublishedReservation(reservation, boardId);

    // A scheduled claim can encounter an already-published ledger entry after
    // a previous worker completed the remote POST but failed to finalize this
    // schedule row. Reconcile this exact claim instead of reporting success
    // while leaving the calendar entry stuck in "publishing".
    if (scheduleClaim) {
      const finalized = await supabase
        .from("pin_schedules")
        .update({
          status: "published",
          pinterest_pin_id: existingPublication.pinterest_pin_id,
          published_at: new Date().toISOString(),
          claim_token: null,
          last_error: null,
          next_attempt_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", scheduleClaim.scheduleId)
        .eq("user_id", String(userId))
        .eq("pin_id", pinId)
        .eq("pinterest_account_id", accountId)
        .eq("pinterest_board_id", boardId)
        .eq("status", "publishing")
        .eq("claim_token", scheduleClaim.claimToken)
        .select("id")
        .maybeSingle();

      if (finalized.error) {
        throw httpError(503, "Публикация уже подтверждена, но не удалось обновить расписание. Повторная отправка заблокирована; требуется сверка.");
      }
      if (!isScheduleClaimUpdateConfirmed(finalized)) {
        // A concurrent late-success completion may have finalized the row
        // after the reservation RPC returned. Accept only that exact durable
        // state; never treat a lost claim as a successful update.
        const current = await supabase
          .from("pin_schedules")
          .select("status, pinterest_pin_id, pinterest_board_id")
          .eq("id", scheduleClaim.scheduleId)
          .eq("user_id", String(userId))
          .maybeSingle();
        if (current.error) {
          throw httpError(503, "Не удалось проверить итог расписания Pinterest. Повторная отправка заблокирована.");
        }
        const row = current.data;
        if (
          !row ||
          row.status !== "published" ||
          String(row.pinterest_pin_id || "") !== existingPublication.pinterest_pin_id ||
          String(row.pinterest_board_id || "") !== existingPublication.pinterest_board_id
        ) {
          throw httpError(409, "Задание расписания больше не принадлежит этому обработчику. Требуется сверка.");
        }
      }
    }

    return {
      ok: true,
      already_published: true,
      pinterest_pin_id: existingPublication.pinterest_pin_id,
      board_id: existingPublication.pinterest_board_id,
    };
  }
  if (reservationStatus === "processing") {
    throw httpError(409, "Публикация уже выполняется. Не запускайте её повторно.");
  }
  if (reservationStatus === "unknown") {
    throw httpError(409, "Pinterest мог уже создать этот пин, но результат не подтверждён. Повторная публикация заблокирована во избежание дубликата.");
  }
  if (reservationStatus === "failed") {
    throw httpError(409, "Предыдущий отказ Pinterest не подтверждён как безопасный для повтора. Требуется сверка.");
  }
  if (reservationStatus !== "started") {
    throw httpError(503, "Не удалось безопасно зарезервировать публикацию. Попробуйте позже.");
  }

  const projectUrl = pin.boards && pin.boards.projects ? pin.boards.projects.website_url : null;
  const link = resolvedSnapshot.is_snapshot
    ? resolvedSnapshot.destination_url
    : (resolvedSnapshot.destination_url || destinationUrl || projectUrl);
  const body = {
    board_id: boardId,
    title: String(publishPinData.title || "").slice(0, 100),
    description: String(publishPinData.description || "").slice(0, 800),
    media_source: { source_type: "image_url", url: publishPinData.image_url },
    ...(link ? { link } : {}),
  };

  let result;
  try {
    // Fence the external side effect after account/token preparation and
    // immediately before POST /pins. A stale worker must not publish.
    result = await withAccount(userId, async (token) => {
      if (scheduleClaim && typeof scheduleClaim.assertClaimCurrent === "function") {
        await scheduleClaim.assertClaimCurrent();
      }
      return callPinterest("POST", "/pins", { token, body });
    }, accountId, { retryRateLimit: false });
  } catch (e) {
    // Only explicit client-side rejections are known not to have created a pin.
    // Every 5xx (including 503) is ambiguous: a gateway may fail after Pinterest
    // has processed the POST. Keep the attempt non-retryable to prevent duplicates.
    const status = Number(e && e.httpStatus);
    const outcomeUnknown = isPinterestPublishOutcomeUnknown(status);
    await persistFailedPublishAttempt({
      userId,
      pinId,
      accountId,
      message: "Pinterest request failed: " + String(e && e.message || "unknown error"),
      outcomeUnknown,
    });
    throw e;
  }

  if (!result.ok) {
    const outcomeUnknown = result.status === 408 || result.status === 429 || result.status >= 500;
    await persistFailedPublishAttempt({
      userId,
      pinId,
      accountId,
      message: "Pinterest HTTP " + result.status + ": " + pinterestMessage(result.data, "unknown error"),
      outcomeUnknown,
    });
    console.error("[pinterest] публикация не удалась:", result.status, pinterestMessage(result.data, ""));
    if (outcomeUnknown) {
      throw httpError(502, "Pinterest не подтвердил результат. Повторная публикация заблокирована во избежание дубликата.");
    }
    throw httpError(502, `Pinterest отклонил публикацию: ${pinterestMessage(result.data, "неизвестная ошибка")}`);
  }

  const remoteId = String((result.data && result.data.id) || "");
  if (!remoteId) {
    await persistFailedPublishAttempt({
      userId,
      pinId,
      accountId,
      message: "Pinterest returned success without a pin id",
      outcomeUnknown: true,
    });
    throw httpError(502, "Pinterest не вернул ID созданного пина. Повторная публикация заблокирована.");
  }

  const { error: completeError } = await supabase.rpc("complete_pinterest_publish_v2", {
    p_user_id: String(userId),
    p_pin_id: pinId,
    p_pinterest_account_id: accountId,
    p_pinterest_pin_id: remoteId,
    p_pinterest_board_id: boardId,
  });
  if (completeError) {
    // A PostgREST/network error does not prove that the SQL transaction rolled
    // back. Check the durable ledger before writing an "unknown" failure over
    // a completion that may already have committed atomically.
    let confirmedLedger = null;
    try {
      const lookup = await supabase
        .from("pinterest_publications")
        .select("user_id, pin_id, pinterest_account_id, pinterest_pin_id, pinterest_board_id")
        .eq("user_id", String(userId))
        .eq("pin_id", pinId)
        .eq("pinterest_account_id", accountId)
        .maybeSingle();
      if (!lookup.error && matchesConfirmedPublicationLedger(lookup.data, {
        user_id: String(userId),
        pin_id: pinId,
        pinterest_account_id: accountId,
        pinterest_pin_id: remoteId,
        pinterest_board_id: boardId,
      })) {
        confirmedLedger = lookup.data;
      }
    } catch (lookupError) {
      console.error("[pinterest] не удалось проверить журнал после неоднозначного ответа БД:", lookupError && lookupError.message);
    }

    if (confirmedLedger) {
      console.warn("[pinterest] completion RPC вернул ошибку, но точная публикация уже подтверждена журналом");
      return {
        ok: true,
        already_published: true,
        pinterest_pin_id: remoteId,
        board_id: boardId,
      };
    }

    await persistFailedPublishAttempt({
      userId,
      pinId,
      accountId,
      message: "Pinterest created pin " + remoteId + " but local commit failed: " + completeError.message,
      outcomeUnknown: true,
    }).catch((journalError) => {
      // The completed publication row may already exist; never replace the
      // primary commit diagnostic with a secondary journal-update failure.
      console.error("[pinterest] дополнительная фиксация неизвестного исхода не удалась:", journalError && journalError.message);
    });
    console.error("[pinterest] пин создан, но не удалось сохранить подтверждение:", completeError.message);
    throw httpError(503, "Pinterest создал пин, но PinPosy не смог сохранить подтверждение. Повторная публикация заблокирована; требуется сверка.");
  }

  return { ok: true, pinterest_pin_id: remoteId, board_id: boardId };
}

// ---------- роуты ----------

function registerRoutes(app, deps) {
  const { requireAuth, requireTariff, handleError } = deps;

  // Статус подключения: только безопасные поля, без токенов
  app.get("/integrations/pinterest/status", requireAuth, async (req, res) => {
    try {
      const configured = isConfigured();
      if (!configured) return res.json({ configured: false, connected: false });
      const accounts = await getAccounts(req.userId);
      const primary = accounts[0] || null;
      const tariff = await getTariffState(req.userId);
      const accountLimits = { analytics: 1, start: 3, pro: 10, agency: null };
      const plan = normalizePlan(tariff.plan);
      const accountLimit = tariff.active && Object.prototype.hasOwnProperty.call(accountLimits, plan)
        ? accountLimits[plan]
        : 0;
      res.json({
        configured: true,
        connected: accounts.length > 0,
        account_count: accounts.length,
        account_limit: accountLimit,
        accounts: accounts.map(toPublicPinterestAccount),
        // Backward-compatible fields for the current single-account settings card.
        username: primary ? primary.username : null,
        expires_at: primary ? primary.expires_at : null,
        needs_reauth: isPinterestReauthRequired(primary),
      });
    } catch (e) {
      handleError(res, e);
    }
  });

  // Ссылка для кнопки «Подключить»: токен не попадает в URL, обмен идёт через заголовок
  app.post("/integrations/pinterest/link", requireAuth, pinterestOAuthStartLimiter, async (req, res) => {
    try {
      requireConfigured();
      const { data: account, error: accountError } = await supabase
        .from("users")
        .select("token_version")
        .eq("id", req.userId)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account) throw httpError(401, "Не авторизован");
      // Register a new single-use attempt. A newer attempt supersedes older tabs.
      const attemptId = crypto.randomUUID();
      const { data: generation, error: beginError } = await supabase.rpc("begin_pinterest_oauth_attempt", {
        p_user_id: String(req.userId),
        p_attempt_id: attemptId,
        p_token_version: Number(account.token_version || 0),
      });
      if (beginError) throw beginError;
      if (generation == null) throw httpError(503, "Не удалось начать подключение Pinterest. Попробуйте позже.");
      // Bind this short-lived OAuth state to the browser that initiated the flow.
      // Only the hash is signed into state; the raw secret stays in an HttpOnly cookie.
      const browserBinding = createBrowserBinding();
      const state = createState(req.userId, account.token_version, attemptId, generation, browserBinding.hash);
      // The browser submits the proof to a top-level backend navigation. This
      // makes the cookie first-party even when the SPA and API are on different
      // registrable domains (where third-party Set-Cookie may be blocked).
      const startUrl = new URL("/integrations/pinterest/start", redirectUri()).toString();
      res.json({
        start_url: startUrl,
        state,
        browser_binding_secret: browserBinding.secret,
      });
    } catch (e) {
      handleError(res, e);
    }
  });

  // Complete the browser-binding step as a top-level form POST before leaving for Pinterest.
  // This avoids relying on third-party cookies during the SPA -> API fetch.
  app.post("/integrations/pinterest/start", pinterestOAuthStartLimiter, express.urlencoded({ extended: false, limit: "8kb" }), async (req, res) => {
    try {
      const state = String(req.body && req.body.state || "");
      const secret = String(req.body && req.body.browser_binding_secret || "");
      const stateClaims = readStateClaims(state);
      if (!matchesBrowserBinding(secret, stateClaims.browserBindingHash)) {
        throw httpError(400, "Pinterest connection must be started from the original PinPosy browser session.");
      }
      res.setHeader("Set-Cookie", serializeBindingCookie(secret));
      const params = new URLSearchParams({
        client_id: clientId(),
        redirect_uri: redirectUri(),
        response_type: "code",
        scope: SCOPES.join(","),
        state,
      });
      res.redirect(302, `${AUTHORIZE_URL}?${params.toString()}`);
    } catch (e) {
      console.error("[pinterest] OAuth start failed:", e && e.message);
      res.status(e.status || 400).send("Pinterest connection could not be started. Return to PinPosy and try again.");
    }
  });

  // Возврат с Pinterest: браузер приходит без нашего токена, проверяем подписанный state
  app.get("/integrations/pinterest/callback", pinterestOAuthCallbackLimiter, async (req, res) => {
    const back = (q) => `${frontendBase()}/app?pinterest=${q}`;
    try {
      const stateClaims = readStateClaims(req.query.state);
      const browserBindingSecret = readCookie(req.headers.cookie);
      if (!matchesBrowserBinding(browserBindingSecret, stateClaims.browserBindingHash)) {
        throw httpError(400, "Pinterest connection must be completed in the browser where it was started.");
      }
      // Consume the one-time browser proof only after it has been matched.
      res.setHeader("Set-Cookie", clearBindingCookie());
      const userId = stateClaims.userId;
      // Password reset increments token_version. A callback started by an old
      // session must not reconnect an external Pinterest account afterwards.
      const { data: currentUser, error: userLookupError } = await supabase
        .from("users")
        .select("token_version")
        .eq("id", userId)
        .maybeSingle();
      if (userLookupError) throw userLookupError;
      if (
        !currentUser ||
        Number(currentUser.token_version || 0) !== Number(stateClaims.tokenVersion || 0)
      ) {
        throw httpError(401, "OAuth session expired");
      }
      const err = req.query.error;
      if (err) {
        console.warn("[pinterest] пользователь отказал в доступе:", err);
        return res.redirect(back("denied"));
      }
      if (!req.query.code) return res.redirect(back("error"));

      const tokenResponse = await exchangeCode(req.query.code);

      // Профиль нужен только для красивого @логина в кабинете
      let profile = null;
      const me = await callPinterest("GET", "/user_account", { token: tokenResponse.access_token });
      if (me.ok && me.data) profile = me.data;

      let expiresAt;
      try {
        expiresAt = getPinterestTokenExpiresAt(tokenResponse && tokenResponse.expires_in);
      } catch (expiryError) {
        console.error("[pinterest] OAuth token response contained an invalid expiry:", expiryError && expiryError.message);
        throw httpError(502, "Pinterest вернул некорректный срок действия токена. Подключение не сохранено.");
      }
      if (!profile || !profile.id) {
        throw httpError(502, "Pinterest не вернул идентификатор аккаунта. Подключение не сохранено.");
      }

      const tariff = await getTariffState(userId);
      if (!tariff.active) {
        return res.redirect(back("plan_required"));
      }
      const { data: committed, error: commitError } = await supabase.rpc("commit_pinterest_oauth_attempt_v2", {
        p_user_id: String(userId),
        p_attempt_id: String(stateClaims.attemptId || ""),
        p_generation: Number(stateClaims.generation),
        p_token_version: Number(stateClaims.tokenVersion || 0),
        p_pinterest_user_id: String(profile.id),
        p_username: profile.username ? String(profile.username) : null,
        p_access_token: encryptToken(tokenResponse.access_token),
        p_refresh_token: encryptToken(tokenResponse.refresh_token || null),
        p_scopes: tokenResponse.scope || SCOPES.join(","),
        p_expires_at: expiresAt,
      });
      if (commitError) throw commitError;
      if (!committed || committed.ok !== true) {
        if (committed && committed.reason === "account_limit_reached") {
          return res.redirect(back("limit"));
        }
        if (committed && committed.reason === "plan_required") {
          return res.redirect(back("plan_required"));
        }
        throw httpError(409, "Попытка подключения Pinterest устарела или не прошла проверку. Начните подключение заново.");
      }
      console.log(`[pinterest] аккаунт подключён: user=${userId} login=${profile && profile.username}`);
      res.redirect(back("connected"));
    } catch (e) {
      console.error("[pinterest] callback не удался:", e && e.message);
      res.redirect(back("error"));
    }
  });

  // Отключение: удаляем строку с токенами
  app.post("/integrations/pinterest/disconnect", requireAuth, pinterestAccountLimiter, async (req, res) => {
    try {
      const accounts = await getAccounts(req.userId);
      const requestedId = req.body && req.body.account_id ? String(req.body.account_id) : null;
      if (!requestedId && accounts.length > 1) {
        throw httpError(422, "Укажите Pinterest-аккаунт, который нужно отключить.");
      }
      const target = requestedId
        ? accounts.find((account) => account.id === requestedId)
        : accounts[0];
      if (!target) throw httpError(404, "Подключённый Pinterest-аккаунт не найден.");
      const { data: disconnected, error } = await supabase.rpc("disconnect_pinterest_account_v2", {
        p_user_id: String(req.userId),
        p_pinterest_account_id: target.id,
      });
      if (error) throw error;
      if (!disconnected) throw httpError(503, "Не удалось безопасно отключить Pinterest. Попробуйте позже.");
      const remaining = await getAccounts(req.userId);
      res.json({ ok: true, connected: remaining.length > 0, accounts: remaining.map(toDisconnectedPinterestAccount) });
    } catch (e) {
      handleError(res, e);
    }
  });

  // Доски пользователя в Pinterest — для выбора, куда публиковать.
  // Pinterest допускает до 2 000 досок; page_size ограничен 250.
  // Повторный проход целиком безопасен при 401/429: withAccount обновит токен
  // или повторит чтение, не создавая никаких удалённых объектов.
  app.get("/integrations/pinterest/boards", requireAuth, pinterestReadLimiter, async (req, res) => {
    try {
      const accountId = req.query.account_id ? String(req.query.account_id) : null;
      const result = await withAccount(req.userId, (token) =>
        fetchAllPinterestBoards((bookmark) => {
          const params = new URLSearchParams({ page_size: "250" });
          if (bookmark) params.set("bookmark", bookmark);
          return callPinterest("GET", `/boards?${params.toString()}`, { token });
        }), accountId);
      if (!result.ok) {
        throw httpError(502, `Pinterest не отдал доски: ${pinterestMessage(result.data, "неизвестная ошибка")}`);
      }
      const items = (result.data && result.data.items) || [];
      res.json({
        boards: items.map((b) => ({ id: String(b.id), name: b.name, pin_count: b.pin_count ?? null })),
      });
    } catch (e) {
      handleError(res, e);
    }
  });

  // Публикация одобренного пина (нужен тариф с генерацией — как у остальных роутов)
  app.post(
    "/pins/:id/publish",
    requireAuth,
    pinterestPublishLimiter,
    requireTariff(["standard", "pro", "agency", "start"]),
    async (req, res) => {
      try {
        const boardId = (req.body && (req.body.board_id || req.body.pinterest_board_id)) || null;
        const accountId = req.body && req.body.account_id ? String(req.body.account_id) : null;
        const result = await publishPin(req.userId, req.params.id, boardId, null, accountId);
        res.json(result);
      } catch (e) {
        handleError(res, e);
      }
    }
  );

  // Внутренний worker. Вызывается внешним cron только с отдельным секретом.
  app.post("/internal/pinterest/schedule/run", pinterestWorkerLimiter, async (req, res) => {
    const expected = Buffer.from(String(process.env.PINPOSY_SCHEDULER_SECRET || ""));
    const provided = Buffer.from(String(req.get("x-pinposy-scheduler-secret") || ""));
    if (
      expected.length < 32 ||
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(expected, provided)
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      requireConfigured();
      // Keep each request bounded to one item; its claim is renewed while work is active.
      // Repair only rows backed by an exact successful attempt + publication ledger match.
      // This is positive-only: unknown rows without matching evidence remain fenced.
      const { error: reconcileError } = await supabase.rpc("reconcile_confirmed_pinterest_schedule_successes");
      if (reconcileError) throw reconcileError;

      // Enforce one claim per request on the server; never trust a caller-supplied
      // batch size for leased work.
      const limit = 1;
      const { data: dueRows, error: claimError } = await supabase.rpc("claim_due_pin_schedules", {
        p_limit: limit,
      });
      if (claimError) throw claimError;

      const results = [];
      for (const schedule of dueRows || []) {
        const stopClaimHeartbeat = createScheduleClaimHeartbeat({
          intervalMs: 60_000,
          renew: async () => {
            const { data, error } = await supabase.rpc("renew_pin_schedule_claim", {
              p_schedule_id: schedule.id,
              p_claim_token: schedule.claim_token,
            });
            if (error) throw error;
            return data === true;
          },
          logger: console,
        });
        try {
          // Background jobs must enforce the same paid-plan gate as manual publishing.
          const tariff = await getTariffState(schedule.user_id);
          const activeGenerationPlan =
            tariff.active && GENERATION_PLANS.includes(normalizePlan(tariff.plan));
          if (!activeGenerationPlan) {
            const entitlementError = httpError(403, "Для автоматической публикации нужна активная подписка «Старт» или выше");
            // This is a local entitlement gate, not a transient Pinterest
            // failure. Do not let an older retry-safe publish journal turn
            // an expired subscription into repeated automatic queue attempts.
            entitlementError.retryable = false;
            throw entitlementError;
          }

          const published = await publishPin(
            schedule.user_id,
            schedule.pin_id,
            schedule.pinterest_board_id,
            schedule.destination_url,
            schedule.pinterest_account_id,
            {
              scheduleId: schedule.id,
              claimToken: schedule.claim_token,
              assertClaimCurrent: async () => {
                const { data, error } = await supabase.rpc("renew_pin_schedule_claim", {
                  p_schedule_id: schedule.id,
                  p_claim_token: schedule.claim_token,
                });
                if (error) throw error;
                if (data !== true) {
                  const lostClaimError = httpError(409, "Расписание больше не принадлежит этому обработчику");
                  lostClaimError.code = "SCHEDULE_CLAIM_LOST";
                  throw lostClaimError;
                }
              },
            },
            schedule
          );
          const remoteId = String(published.pinterest_pin_id || "");
          if (!remoteId) throw new Error("Pinterest publication returned no remote ID");

          // publishPin has already committed the remote ID and reconciled the
          // matching schedule atomically via complete_pinterest_publish_v2.
          // Do not issue a second conditional UPDATE with the now-consumed claim
          // token: the completion RPC has already changed status to published
          // and cleared that token.
          results.push({ schedule_id: schedule.id, status: "published" });
        } catch (e) {
          let attempt = null;
          let attemptLookupError = null;
          try {
            const lookup = await supabase
              .from("pinterest_publish_attempts")
              .select("user_id, pin_id, pinterest_account_id, pinterest_board_id, status, pinterest_pin_id, retry_safe")
              .eq("user_id", String(schedule.user_id))
              .eq("pin_id", schedule.pin_id)
              .eq("pinterest_account_id", schedule.pinterest_account_id)
              .maybeSingle();
            attempt = lookup.data;
            attemptLookupError = lookup.error;
            if (!attemptLookupError && attempt && !hasMatchingScheduleAttemptIdentity(attempt, schedule)) {
              attemptLookupError = new Error("Publication journal identity does not match the claimed schedule");
              attempt = null;
            }
          } catch (lookupError) {
            // A rejected transport promise is just as uncertain as a returned
            // Supabase error. Never infer that the remote publish did not happen.
            attemptLookupError = lookupError;
          }

          // A "published" attempt is not enough: only the durable publication
          // ledger proves that Pinterest's remote ID and exact destination were
          // committed. If this lookup fails or disagrees, keep the schedule unknown.
          let publicationLedger = null;
          let publicationLedgerLookupError = null;
          if (!attemptLookupError && attempt && attempt.status === "published") {
            try {
              const ledgerLookup = await supabase
                .from("pinterest_publications")
                .select("user_id, pin_id, pinterest_account_id, pinterest_board_id, pinterest_pin_id")
                .eq("user_id", String(schedule.user_id))
                .eq("pin_id", String(schedule.pin_id))
                .eq("pinterest_account_id", String(schedule.pinterest_account_id))
                .maybeSingle();
              publicationLedger = ledgerLookup.data;
              publicationLedgerLookupError = ledgerLookup.error;
            } catch (ledgerError) {
              publicationLedgerLookupError = ledgerError;
            }
          }

          const failure = buildScheduleWorkerFailureState({
            attempt,
            attemptLookupError,
            publicationLedger,
            publicationLedgerLookupError,
            error: e,
            attempts: schedule.attempts,
          });
          const { finalStatus, message, retryAt, nextStatus } = failure;
          let scheduleUpdateError = null;
          try {
            if (!hasCompleteScheduleClaimIdentity(schedule)) {
              throw new Error("Claimed schedule is missing a required identity field; refusing to mutate it");
            }
            const update = await supabase
              .from("pin_schedules")
              .update({
                status: nextStatus,
                claim_token: null,
                pinterest_pin_id: finalStatus === "published" ? attempt.pinterest_pin_id : null,
                published_at: finalStatus === "published" ? new Date().toISOString() : null,
                last_error: finalStatus === "published" ? null : message,
                next_attempt_at: retryAt,
                updated_at: new Date().toISOString(),
              })
              .eq("id", schedule.id)
              .eq("user_id", String(schedule.user_id))
              .eq("pin_id", String(schedule.pin_id))
              .eq("pinterest_account_id", String(schedule.pinterest_account_id))
              .eq("pinterest_board_id", String(schedule.pinterest_board_id))
              .eq("status", "publishing")
              .eq("claim_token", schedule.claim_token)
              .select("id")
              .maybeSingle();
            scheduleUpdateError = update.error;
            if (!scheduleUpdateError && !isScheduleClaimUpdateConfirmed(update)) {
              scheduleUpdateError = new Error("Schedule claim is no longer current; no row was updated");
            }
          } catch (updateError) {
            // Keep processing the rest of the claimed batch. This row remains
            // fenced by its claim token and is reconciled by stale-claim recovery.
            scheduleUpdateError = updateError;
          }
          if (scheduleUpdateError) {
            console.error("[pinterest-worker] не удалось сохранить итоговый статус расписания:", scheduleUpdateError.message);
          }
          results.push({
            schedule_id: schedule.id,
            status: scheduleUpdateError ? "unknown" : nextStatus,
            retry_at: !scheduleUpdateError ? retryAt : undefined,
            error: finalStatus === "published" && !scheduleUpdateError ? undefined : message,
          });
        } finally {
          await stopClaimHeartbeat();
        }
      }

      res.json({
        ok: true,
        claimed: (dueRows || []).length,
        published: results.filter((r) => r.status === "published").length,
        failed: results.filter((r) => r.status === "failed").length,
        scheduled: results.filter((r) => r.status === "scheduled").length,
        unknown: results.filter((r) => r.status === "unknown").length,
        results,
      });
    } catch (e) {
      console.error("[pinterest-worker] run failed:", e && e.message);
      res.status(500).json({ error: "Pinterest schedule worker failed" });
    }
  });

  console.log(`[pinterest] роуты подключены, интеграция ${isConfigured() ? "настроена" : "НЕ настроена (нет PINTEREST_*)"}`);
}

module.exports = {
  registerRoutes,
  isConfigured,
  createState,
  readState,
  getAccounts,
  resolveAccount,
  publishPin,
  verifyPinterestBoard,
  classifyScheduleFailure,
  SCOPES,
};
