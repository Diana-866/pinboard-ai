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
const { executeWithAccountToken } = require("./pinterestAccountRequest");
const crypto = require("crypto");
const { hasEncryptionKey, isEncryptedToken, encryptToken, decryptToken } = require("./pinterestTokenCrypto");
const jwt = require("jsonwebtoken");
const supabase = require("./supabase");
const { getTariffState, normalizePlan, GENERATION_PLANS } = require("./tariff");
const { httpError } = require("./validate");
const { classifyScheduleFailure, canRetryScheduleFailure, getScheduleRetryDelayMinutes } = require("./pinterestSchedule");

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
function createState(userId, tokenVersion = 0, attemptId, generation) {
  return jwt.sign(
    {
      userId,
      tokenVersion: Number(tokenVersion) || 0,
      attemptId,
      generation: Number(generation),
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
      Number(decoded.generation) < 1
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
    return { ok: res.status >= 200 && res.status < 300, status: res.status, data: res.data };
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
  if (!data) return null;
  let stored = data;
  // Migrate legacy plaintext tokens with an optimistic update on the exact row.
  // Do not let legacy plaintext migration clear a durable refresh uncertainty fence.
  // decryptToken() can still read legacy values without rewriting the row.
  if (hasEncryptionKey() && data.refresh_state !== "uncertain" &&
      (!isEncryptedToken(data.access_token) || (data.refresh_token && !isEncryptedToken(data.refresh_token)))) {
    const encrypted = {
      access_token: data.access_token ? encryptToken(data.access_token) : null,
      refresh_token: data.refresh_token ? encryptToken(data.refresh_token) : null,
      updated_at: new Date().toISOString(),
    };
    const { data: updated, error: updateError } = await supabase
      .from("pinterest_accounts")
      .update(encrypted)
      .eq("id", data.id)
      .eq("user_id", data.user_id)
      .eq("updated_at", data.updated_at)
      .select("*")
      .maybeSingle();
    if (updateError) throw updateError;
    stored = updated || data;
  }
  return {
    ...stored,
    access_token: decryptToken(stored.access_token),
    refresh_token: decryptToken(stored.refresh_token),
  };
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
        throw httpError(409, "Не удалось подтвердить обновление Pinterest-доступа. Подключите аккаунт заново.");
      }
      if (
        latest.access_token !== account.access_token ||
        latest.refresh_token !== account.refresh_token
      ) {
        return latest;
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
      throw httpError(409, "Pinterest-доступ истёк. Подключите аккаунт заново.");
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
      // The RPC may have committed even if its response was lost. Reconcile
      // before telling the user to reconnect or allowing another refresh.
      const reconciled = await getAccount(latest.user_id, latest.id).catch(() => null);
      if (
        reconciled &&
        (reconciled.access_token !== latest.access_token ||
          reconciled.refresh_token !== latest.refresh_token ||
          reconciled.updated_at !== latest.updated_at)
      ) {
        console.warn("[pinterest] refresh commit response was ambiguous; newer stored credentials were recovered");
        return reconciled;
      }
      console.error("[pinterest] не удалось атомарно сохранить обновлённые токены:", commitError.message);
      throw httpError(503, "Pinterest обновил доступ, но PinPosy не смог подтвердить сохранение токенов. Повторите запрос; если ошибка повторится, подключите Pinterest заново.");
    }
    if (!committed) {
      // OAuth reconnect or lease expiry won the race. Never overwrite its row.
      const current = await getAccount(latest.user_id, latest.id);
      if (
        current &&
        (current.access_token !== latest.access_token ||
          current.refresh_token !== latest.refresh_token ||
          current.updated_at !== latest.updated_at)
      ) {
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
 * 429 -> одна повторная попытка через 2 секунды.
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
    throw httpError(422, "Выберите существующую доску Pinterest перед планированием публикации");
  }

  const boardResult = await withAccount(userId, (token) =>
    callPinterest("GET", `/boards/${encodeURIComponent(boardId)}`, { token }),
    accountId
  );
  if (!boardResult.ok) {
    if ([403, 404].includes(boardResult.status)) {
      throw httpError(422, "Выбранная доска не найдена или недоступна подключённому Pinterest-аккаунту");
    }
    throw httpError(502, "Не удалось проверить выбранную доску Pinterest. Попробуйте позже.");
  }

  const verifiedBoardId = String((boardResult.data && boardResult.data.id) || "");
  if (verifiedBoardId !== boardId) {
    throw httpError(422, "Pinterest не подтвердил принадлежность выбранной доски аккаунту");
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

async function publishPin(userId, pinId, pinterestBoardId, scheduledDestinationUrl, accountId = null, scheduleClaim = null) {
  const boardId = String(pinterestBoardId || "").trim();
  if (!boardId) throw httpError(422, "board_id обязателен: выберите доску Pinterest");

  // Проверяем владельца локального пина и доступность доски до резервации.
  const pin = await getPinWithOwner(pinId, userId);
  if (pin.status !== "approved") {
    throw httpError(409, "Публиковать можно только одобренные пины");
  }
  if (!pin.image_url) throw httpError(422, "У пина нет изображения — сначала сгенерируйте картинку");
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
    return {
      ok: true,
      already_published: true,
      pinterest_pin_id: reservation.pinterest_pin_id,
      board_id: reservation.pinterest_board_id || boardId,
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
  const link = destinationUrl || projectUrl;
  const body = {
    board_id: boardId,
    title: String(pin.title || "").slice(0, 100),
    description: String(pin.description || "").slice(0, 800),
    media_source: { source_type: "image_url", url: pin.image_url },
    ...(link ? { link } : {}),
  };

  let result;
  try {
    result = await withAccount(userId, (token) => callPinterest("POST", "/pins", { token, body }), accountId, { retryRateLimit: false });
  } catch (e) {
    // 409/422/403/404/503 означают, что запрос на создание пина не дошёл
    // до успешного вызова Pinterest (например, аккаунт не подключён).
    // Сетевые 502/таймауты остаются неоднозначными и требуют сверки.
    const status = Number(e && e.httpStatus);
    const outcomeUnknown = ![403, 404, 409, 422, 503].includes(status);
    await supabase.rpc("fail_pinterest_publish_v2", {
      p_user_id: String(userId),
      p_pin_id: pinId,
      p_pinterest_account_id: accountId,
      p_error: "Pinterest request failed: " + String(e && e.message || "unknown error"),
      p_outcome_unknown: outcomeUnknown,
    }).catch(() => {});
    throw e;
  }

  if (!result.ok) {
    const outcomeUnknown = result.status === 408 || result.status === 429 || result.status >= 500;
    await supabase.rpc("fail_pinterest_publish_v2", {
      p_user_id: String(userId),
      p_pin_id: pinId,
      p_pinterest_account_id: accountId,
      p_error: "Pinterest HTTP " + result.status + ": " + pinterestMessage(result.data, "unknown error"),
      p_outcome_unknown: outcomeUnknown,
    });
    console.error("[pinterest] публикация не удалась:", result.status, pinterestMessage(result.data, ""));
    if (outcomeUnknown) {
      throw httpError(502, "Pinterest не подтвердил результат. Повторная публикация заблокирована во избежание дубликата.");
    }
    throw httpError(502, `Pinterest отклонил публикацию: ${pinterestMessage(result.data, "неизвестная ошибка")}`);
  }

  const remoteId = String((result.data && result.data.id) || "");
  if (!remoteId) {
    await supabase.rpc("fail_pinterest_publish_v2", {
      p_user_id: String(userId),
      p_pin_id: pinId,
      p_pinterest_account_id: accountId,
      p_error: "Pinterest returned success without a pin id",
      p_outcome_unknown: true,
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
    await supabase.rpc("fail_pinterest_publish_v2", {
      p_user_id: String(userId),
      p_pin_id: pinId,
      p_pinterest_account_id: accountId,
      p_error: "Pinterest created pin " + remoteId + " but local commit failed: " + completeError.message,
      p_outcome_unknown: true,
    }).catch(() => {});
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
        accounts: accounts.map((account) => ({
          id: account.id,
          pinterest_user_id: account.pinterest_user_id,
          username: account.username,
          expires_at: account.expires_at,
          needs_reauth: account.refresh_state === "uncertain" || !!(account.expires_at && new Date(account.expires_at).getTime() < Date.now()),
        })),
        // Backward-compatible fields for the current single-account settings card.
        username: primary ? primary.username : null,
        expires_at: primary ? primary.expires_at : null,
        needs_reauth: !!(primary && (primary.refresh_state === "uncertain" || (primary.expires_at && new Date(primary.expires_at).getTime() < Date.now()))),
      });
    } catch (e) {
      handleError(res, e);
    }
  });

  // Ссылка для кнопки «Подключить»: токен не попадает в URL, обмен идёт через заголовок
  app.post("/integrations/pinterest/link", requireAuth, async (req, res) => {
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
      const state = createState(req.userId, account.token_version, attemptId, generation);
      const params = new URLSearchParams({
        client_id: clientId(),
        redirect_uri: redirectUri(),
        response_type: "code",
        scope: SCOPES.join(","),
        state,
      });
      res.json({ authorize_url: `${AUTHORIZE_URL}?${params.toString()}` });
    } catch (e) {
      handleError(res, e);
    }
  });

  // Возврат с Pinterest: браузер приходит без нашего токена, проверяем подписанный state
  app.get("/integrations/pinterest/callback", async (req, res) => {
    const back = (q) => `${frontendBase()}/app?pinterest=${q}`;
    try {
      const stateClaims = readStateClaims(req.query.state);
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

      const now = Date.now();
      const expiresAt = tokenResponse && tokenResponse.expires_in
        ? new Date(now + Number(tokenResponse.expires_in) * 1000).toISOString()
        : null;
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
  app.post("/integrations/pinterest/disconnect", requireAuth, async (req, res) => {
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
      res.json({ ok: true, connected: remaining.length > 0, accounts: remaining.map((a) => ({ id: a.id, username: a.username })) });
    } catch (e) {
      handleError(res, e);
    }
  });

  // Доски пользователя в Pinterest — для выбора, куда публиковать.
  // Pinterest допускает до 2 000 досок; page_size ограничен 250.
  // Повторный проход целиком безопасен при 401/429: withAccount обновит токен
  // или повторит чтение, не создавая никаких удалённых объектов.
  app.get("/integrations/pinterest/boards", requireAuth, async (req, res) => {
    try {
      const accountId = req.query.account_id ? String(req.query.account_id) : null;
      const result = await withAccount(req.userId, async (token) => {
        const items = [];
        let bookmark = null;
        for (let page = 0; page < 8; page += 1) {
          const params = new URLSearchParams({ page_size: "250" });
          if (bookmark) params.set("bookmark", bookmark);
          const pageResult = await callPinterest("GET", `/boards?${params.toString()}`, { token });
          if (!pageResult.ok) return pageResult;
          items.push(...((pageResult.data && pageResult.data.items) || []));
          bookmark = pageResult.data && pageResult.data.bookmark;
          if (!bookmark) return { ...pageResult, data: { items } };
        }
        // Не отдаём незаметно неполный список, если Pinterest изменит лимиты.
        return {
          ok: false,
          status: 502,
          data: { message: "Pinterest вернул больше страниц досок, чем поддерживает текущая загрузка" },
        };
      }, accountId);
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
  app.post("/internal/pinterest/schedule/run", async (req, res) => {
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
      // Keep claimed work comfortably below the 20-minute stale-claim recovery window.
      // The worker processes this batch sequentially; a large batch could make later
      // rows look abandoned before this instance reaches them.
      const limit = Math.max(1, Math.min(Number(req.body && req.body.limit) || 10, 10));
      const { data: dueRows, error: claimError } = await supabase.rpc("claim_due_pin_schedules", {
        p_limit: limit,
      });
      if (claimError) throw claimError;

      const results = [];
      for (const schedule of dueRows || []) {
        try {
          // Background jobs must enforce the same paid-plan gate as manual publishing.
          const tariff = await getTariffState(schedule.user_id);
          const activeGenerationPlan =
            tariff.active && GENERATION_PLANS.includes(normalizePlan(tariff.plan));
          if (!activeGenerationPlan) {
            throw httpError(403, "Для автоматической публикации нужна активная подписка «Старт» или выше");
          }

          const published = await publishPin(
            schedule.user_id,
            schedule.pin_id,
            schedule.pinterest_board_id,
            schedule.destination_url,
            schedule.pinterest_account_id,
            { scheduleId: schedule.id, claimToken: schedule.claim_token }
          );
          const remoteId = String(published.pinterest_pin_id || "");
          if (!remoteId) throw new Error("Pinterest publication returned no remote ID");

          const { error: updateError } = await supabase
            .from("pin_schedules")
            .update({
              status: "published",
              claim_token: null,
              pinterest_pin_id: remoteId,
              published_at: new Date().toISOString(),
              last_error: null,
              next_attempt_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", schedule.id)
            .eq("status", "publishing")
            .eq("claim_token", schedule.claim_token);
          if (updateError) throw updateError;
          results.push({ schedule_id: schedule.id, status: "published" });
        } catch (e) {
          const { data: attempt, error: attemptLookupError } = await supabase
            .from("pinterest_publish_attempts")
            .select("status, pinterest_pin_id, retry_safe")
            .eq("pin_id", schedule.pin_id)
            .eq("pinterest_account_id", schedule.pinterest_account_id)
            .maybeSingle();
          // If the journal cannot be read, the outcome is not safe to classify
          // as failed: the remote pin may already exist. Keep it non-retryable.
          const finalStatus = classifyScheduleFailure(attempt, attemptLookupError);
          const message = String(
            attemptLookupError
              ? "Could not verify publication journal after worker error: " + attemptLookupError.message
              : e && e.message || "Publication failed"
          ).slice(0, 500);
          const retryable = canRetryScheduleFailure(attempt, attemptLookupError, e);
          const retryLimit = 5;
          const shouldRetry = retryable && Number(schedule.attempts || 0) < retryLimit;
          const retryAt = shouldRetry
            ? new Date(Date.now() + getScheduleRetryDelayMinutes(schedule.attempts) * 60_000).toISOString()
            : null;
          const nextStatus = shouldRetry ? "scheduled" : finalStatus;
          const { error: scheduleUpdateError } = await supabase
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
            .eq("status", "publishing")
            .eq("claim_token", schedule.claim_token);
          if (scheduleUpdateError) {
            console.error("[pinterest-worker] не удалось сохранить итоговый статус расписания:", scheduleUpdateError.message);
          }
          results.push({
            schedule_id: schedule.id,
            status: scheduleUpdateError ? "unknown" : nextStatus,
            retry_at: !scheduleUpdateError ? retryAt : undefined,
            error: finalStatus === "published" && !scheduleUpdateError ? undefined : message,
          });
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
