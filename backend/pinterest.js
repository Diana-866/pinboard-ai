// Pinterest API v5: OAuth 2.0 (вход через Pinterest) и публикация пинов.
// Документация:
//   авторизация: https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/
//   токен:       https://developers.pinterest.com/docs/api/v5/oauth-token/
//   создание пина: https://developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/
//
// Правила этого файла:
//   1. Токены Pinterest живут только на сервере. Наружу уходят лишь username и дата истечения.
//   2. Если PINTEREST_* не заданы — все роуты отвечают 503, остальной сервис работает как обычно.
//   3. Один локальный пин публикуется ровно один раз (unique index в миграции 008).

const axios = require("axios");
const jwt = require("jsonwebtoken");
const supabase = require("./supabase");
const { httpError } = require("./validate");

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
  return !!(clientId() && clientSecret() && redirectUri());
}
function requireConfigured() {
  if (!isConfigured()) {
    throw httpError(
      503,
      "Интеграция с Pinterest не настроена: задайте PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET и PINTEREST_REDIRECT_URI в переменных окружения Render"
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

/** Короткоживущий подписанный state: внутрь кладём userId, срок 15 минут. */
function createState(userId) {
  return jwt.sign({ userId, purpose: "pinterest_oauth" }, process.env.JWT_SECRET, {
    expiresIn: STATE_TTL,
  });
}

function readState(state) {
  try {
    const decoded = jwt.verify(String(state || ""), process.env.JWT_SECRET);
    if (!decoded || decoded.purpose !== "pinterest_oauth" || !decoded.userId) {
      throw new Error("не тот state");
    }
    return decoded.userId;
  } catch (e) {
    throw httpError(400, "Ссылка подключения Pinterest устарела. Вернитесь в кабинет и нажмите «Подключить» ещё раз.");
  }
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

async function getAccount(userId) {
  const { data, error } = await supabase
    .from("pinterest_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function saveAccount(userId, tokenResponse, profile) {
  const now = Date.now();
  const expiresAt =
    tokenResponse && tokenResponse.expires_in
      ? new Date(now + Number(tokenResponse.expires_in) * 1000).toISOString()
      : null;

  const row = {
    user_id: userId,
    pinterest_user_id: profile && profile.id ? String(profile.id) : null,
    username: profile && profile.username ? String(profile.username) : null,
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token || null,
    scopes: tokenResponse.scope || SCOPES.join(","),
    expires_at: expiresAt,
    updated_at: new Date(now).toISOString(),
  };

  const { data, error } = await supabase
    .from("pinterest_accounts")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
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
  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
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
    console.error("[pinterest] обновление токена не удалось:", res.status);
    throw httpError(409, "Pinterest-доступ истёк. Подключите аккаунт заново.");
  }
  const saved = await saveAccount(account.user_id, res.data, {
    id: account.pinterest_user_id,
    username: account.username,
  });
  return saved;
}

/**
 * Запрос к Pinterest от имени пользователя.
 * 401 -> один раз обновляем токен и повторяем.
 * 429 -> одна повторная попытка через 2 секунды.
 */
async function withAccount(userId, handler) {
  requireConfigured();
  let account = await getAccount(userId);
  if (!account) throw httpError(409, "Pinterest не подключён. Нажмите «Подключить Pinterest» в настройках.");

  let result = await handler(account.access_token);

  if (result.status === 401) {
    account = await refreshAccessToken(account);
    result = await handler(account.access_token);
  }
  if (result.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    result = await handler(account.access_token);
  }
  return result;
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

async function publishPin(userId, pinId, pinterestBoardId) {
  const boardId = String(pinterestBoardId || "").trim();
  if (!boardId) throw httpError(422, "board_id обязателен: выберите доску Pinterest");

  // Идемпотентность: повторный клик не создаёт второй пин в Pinterest
  const { data: existing, error: existingError } = await supabase
    .from("pinterest_publications")
    .select("pinterest_pin_id, pinterest_board_id, created_at")
    .eq("pin_id", pinId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return { ok: true, already_published: true, pinterest_pin_id: existing.pinterest_pin_id, board_id: existing.pinterest_board_id };
  }

  const pin = await getPinWithOwner(pinId, userId);
  if (!pin.image_url) throw httpError(422, "У пина нет изображения — сначала сгенерируйте картинку");

  const projectUrl = pin.boards && pin.boards.projects ? pin.boards.projects.website_url : null;
  const body = {
    board_id: boardId,
    title: String(pin.title || "").slice(0, 100),
    description: String(pin.description || "").slice(0, 800),
    media_source: { source_type: "image_url", url: pin.image_url },
    ...(projectUrl ? { link: projectUrl } : {}),
  };

  const result = await withAccount(userId, (token) => callPinterest("POST", "/pins", { token, body }));
  if (!result.ok) {
    console.error("[pinterest] публикация не удалась:", result.status, pinterestMessage(result.data, ""));
    throw httpError(502, `Pinterest отклонил публикацию: ${pinterestMessage(result.data, "неизвестная ошибка")}`);
  }

  const remoteId = String((result.data && result.data.id) || "");
  if (!remoteId) throw httpError(502, "Pinterest вернул пустой ответ при создании пина");

  const { error: logError } = await supabase.from("pinterest_publications").insert({
    user_id: userId,
    pin_id: pin.id,
    pinterest_pin_id: remoteId,
    pinterest_board_id: boardId,
  });
  if (logError) {
    // Пин уже создан в Pinterest — не роняем ответ, только пишем в лог
    console.error("[pinterest] пин создан, но журнал не записан:", logError.message);
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
      const account = await getAccount(req.userId);
      res.json({
        configured: true,
        connected: !!account,
        username: account ? account.username : null,
        expires_at: account ? account.expires_at : null,
        needs_reauth: !!(account && account.expires_at && new Date(account.expires_at).getTime() < Date.now()),
      });
    } catch (e) {
      handleError(res, e);
    }
  });

  // Ссылка для кнопки «Подключить»: токен не попадает в URL, обмен идёт через заголовок
  app.post("/integrations/pinterest/link", requireAuth, async (req, res) => {
    try {
      requireConfigured();
      const state = createState(req.userId);
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
      const userId = readState(req.query.state);
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

      await saveAccount(userId, tokenResponse, profile);
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
      const { error } = await supabase.from("pinterest_accounts").delete().eq("user_id", req.userId);
      if (error) throw error;
      res.json({ ok: true, connected: false });
    } catch (e) {
      handleError(res, e);
    }
  });

  // Доски пользователя в Pinterest — для выбора, куда публиковать
  app.get("/integrations/pinterest/boards", requireAuth, async (req, res) => {
    try {
      const result = await withAccount(req.userId, (token) =>
        callPinterest("GET", "/boards?page_size=100", { token })
      );
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
        const result = await publishPin(req.userId, req.params.id, boardId);
        res.json(result);
      } catch (e) {
        handleError(res, e);
      }
    }
  );

  console.log(`[pinterest] роуты подключены, интеграция ${isConfigured() ? "настроена" : "НЕ настроена (нет PINTEREST_*)"}`);
}

module.exports = {
  registerRoutes,
  isConfigured,
  createState,
  readState,
  publishPin,
  SCOPES,
};
