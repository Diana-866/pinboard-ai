const { installFatalProcessHandlers } = require("./fatalProcessHandlers");
const { settleQuery } = require("./settleQuery");
installFatalProcessHandlers();

const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit").rateLimit;
const { ipKeyGenerator } = require("express-rate-limit");
const { parseMultipartFields } = require("./prodamusWebhookBody");
const { isOwnedByUser } = require("./resourceOwnership");
const { assertPublicWebsiteAddress } = require("./publicUrl");
const { serializeGenerationRecovery } = require("./generationRecovery");
const { isAllowedPinImageUploadMime } = require("./imageUploadValidation");
const { serializePinImageUploadError } = require("./imageUploadErrors");
const { buildPinImageRateLimitKey } = require("./pinImageRateLimitKey");
const { applyPinImageCompareAndSwapFilter } = require("./pinImageCompareAndSwap");
const { buildBoardPatch } = require("./boardPatch");
const { serializeBoardForClient } = require("./boardSerialization");
const { serializeProjectForClient } = require("./projectSerialization");
const { sortProjectsForProvisioning } = require("./projectProvisioningOrder");
const { buildPinPatch } = require("./pinPatch");
const { logError, logWarning, logInfo, runWithCorrelationId } = require("./safeLogger");
const { buildAccountExport, requestAccountDeletion } = require("./accountLifecycle");

const { getBalance, adjustBalance } = require("./credits");
const { requireAdmin, getStats } = require("./admin");
const { getFinancialOperationsQueue } = require("./adminFinancialOperations");
const { getAccountDeletionInventory } = require("./adminAccountDeletionInventory");
const adminPaymentCreationRequests = require("./adminPaymentCreationRequests");
const adminProviderRefundActions = require("./adminProviderRefundActions");
const adminPinterestReconciliation = require("./adminPinterestReconciliation");
const adminPinterestInventory = require("./adminPinterestInventory");
const { httpError, optionalString, validateEmail, validateEnum, validateInt, validatePassword, validateUrl, validationError } = require("./validate");

const MODEL_PRICES = {
  "flux-schnell": 0.6,
  "grom-nova": 1.5,
  "nano-banana-2-lite": 9.6,
  "nano-banana-pro": 15,
};
const MARKUP = 1.5;
// Every language the product can generate content in. The onboarding project and each generation
// request use the same list, so a customer cannot end up with a project in a language the generator
// cannot write.
const PIN_CONTENT_LANGUAGES = ["ru", "en", "de", "fr", "es", "pt", "zh", "it", "ja"];
const ASPECT_RATIOS = ["2:3", "9:16", "4:5", "3:4", "1:1"];

const { fetchAllPages, readArrayQueryResult } = require("./fetchAllPages");
const { assertJwtSecret } = require("./startupConfig");
// Authentication cannot work without a strong signing key. Fail startup rather
// than reporting a healthy API that cannot issue or verify user sessions.
assertJwtSecret(process.env);

const app = express();
app.set("trust proxy", 1); // за прокси (Render/nginx) реальный IP клиента — иначе лимиты бьют по всем сразу (B3)
// Generate a server-owned request ID; never trust a client-supplied correlation header.
app.use((req, res, next) => {
  const correlationId = crypto.randomUUID();
  res.setHeader("x-request-id", correlationId);
  runWithCorrelationId(correlationId, next);
});
app.use(helmet()); // безопасные HTTP-заголовки (B12)
app.use(
  cors({
    origin: function (origin, callback) {
      // Домены, которые всегда разрешены (включая новый pinposy.com) + все из FRONTEND_URL через запятую
      const allowedOrigins = [
        "https://pinposy.com",
        "https://www.pinposy.com",
        "https://pinboard-ai-web.vercel.app",
        "http://localhost:3000",
        ...(process.env.FRONTEND_URL
          ? process.env.FRONTEND_URL.split(",").map((s) => s.trim()).filter(Boolean)
          : []),
      ];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);
// Global request budget.
//
// Per-route limiters below only cover login, AI, payments, uploads and admin
// actions. Every authenticated read route (/me, /projects, /boards, /schedule,
// /analytics/summary and the admin reads) had no bound at all, so a single
// account could exhaust the database quota and take the service down for
// everyone.
//
// The key is the hashed bearer token when present and the normalized client IP
// otherwise; the raw credential is never stored in the limiter's memory store.
/**
 * Shared 429 responder.
 *
 * express-rate-limit 8 does send Retry-After on its own, but its default body is the English
 * "Too many requests" string and carries no machine-readable field. The API answers in
 * Russian everywhere else, so a throttled request looked like an unknown failure to the web
 * client, which could only show a generic message. This responder keeps the per-limiter
 * message, states the same wait in the body that the header carries (a test pins the two
 * together), and adds a code the client can localize.
 */
function rateLimitedHandler(message) {
  return (req, res, _next, options) => {
    const resetTime = req.rateLimit && req.rateLimit.resetTime;
    const seconds =
      resetTime instanceof Date
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.max(1, Math.ceil((Number(options && options.windowMs) || 60000) / 1000));
    res.set("Retry-After", String(seconds));
    res.status((options && options.statusCode) || 429).json({
      error: message,
      code: "rate_limited",
      retryAfterSeconds: seconds,
    });
  };
}

const API_RATE_LIMIT_MAX = Math.max(1, Number(process.env.API_RATE_LIMIT_MAX) || 300);
const API_RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 60 * 1000);
const apiLimiter = rateLimit({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  limit: API_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Platform probes arrive frequently and must never be throttled. The payment webhook is
  // exempt as well: it is authenticated by a provider signature and carries money
  // notifications, which must not be dropped because a browser budget is exhausted. It has
  // its own, far more generous budget below.
  skip: (req) =>
    req.path === "/health" || req.path === "/ready" || req.path === "/billing/webhook",
  keyGenerator: (req) => {
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (token) {
      return "token:" + crypto.createHash("sha256").update(token).digest("hex");
    }
    return ipKeyGenerator(req.ip);
  },
  handler: rateLimitedHandler("Слишком много запросов. Подождите немного и повторите."),
});
app.use(apiLimiter);

// A provider callback is not browser traffic: a burst of legitimate payment notifications
// (a retry storm after an outage) must not be refused. The budget is generous but finite, so
// a flood of forged callbacks is still bounded, and an unsigned request is rejected by
// signature verification before any state is written.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Math.max(60, Number(process.env.WEBHOOK_RATE_LIMIT_MAX) || 600),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitedHandler("Слишком много платёжных уведомлений. Повторите позже."),
});

// Prodamus may send multipart/form-data (default), urlencoded, or JSON callbacks.
function parseProdamusWebhook(req, res, next) {
  if (req.is("multipart/form-data")) {
    return webhookMultipart(req, res, (error) => {
      if (error) return res.status(400).json({ ok: false, error: "invalid webhook form" });
      try {
        req.body = parseMultipartFields(req.body);
        next();
      } catch {
        res.status(400).json({ ok: false, error: "invalid webhook fields" });
      }
    });
  }
  if (req.is("application/x-www-form-urlencoded")) {
    return express.urlencoded({ extended: true, limit: "32kb" })(req, res, next);
  }
  if (req.is("application/json")) {
    return express.json({ limit: "32kb" })(req, res, next);
  }
  return res.status(415).json({ ok: false, error: "unsupported content type" });
}

app.post("/billing/webhook", webhookLimiter, parseProdamusWebhook, async (req, res) => {
  try {
    const isCreditsOrder = String((req.body && req.body.order_id) || "").startsWith(
      creditsBilling.ORDER_PREFIX + "-"
    );
    await (isCreditsOrder ? creditsBilling.handleCreditsWebhook : billing.handleWebhook)(req, res);
  } catch (e) {
    logError("index.event_022");
    if (!res.headersSent) res.status(500).json({ ok: false, error: "internal" });
  }
});

app.use(express.json({ limit: "100kb" })); // ограничение размера тела (B12)

const AUTH_RATE_LIMIT_MAX = Math.max(1, Number(process.env.AUTH_RATE_LIMIT_MAX) || 10);
const LOGIN_ACCOUNT_RATE_LIMIT_MAX = Math.max(3, Number(process.env.LOGIN_ACCOUNT_RATE_LIMIT_MAX) || 10);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitedHandler("Слишком много попыток. Попробуйте через 15 минут."),
});

// The IP budget above cannot protect one account: an attacker with many addresses, or a
// deployment with several instances, multiplies it. Brute force targets a specific account, so
// the budget is keyed on the normalized email as well. Case and surrounding spaces must not
// open a new bucket, or the guard is decorative.
// The store is process-local (see aiLimiter); a per-account lockout in the database is the
// durable fix and needs a migration.
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: LOGIN_ACCOUNT_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const raw = req && req.body && req.body.email;
    const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    // Requests without an email share one bucket: they are cheap to send and never legitimate.
    return email ? `email:${email}` : "email:missing";
  },
  handler: rateLimitedHandler("Слишком много попыток входа в этот аккаунт. Попробуйте через 15 минут."),
});

// One shared per-account budget for every billable AI route. These routes run
// requireAuth first, so the key is the verified application user ID rather than
// a client-controlled header or a rotating IP address. MemoryStore is still
// process-local; a shared store is required for a cross-instance global quota.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.userId),
  handler: rateLimitedHandler("Слишком много запросов. Подождите минуту."),
});

// Лимит для одноразовых ссылок из писем: попыток перебора токенов быть не должно
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitedHandler("Слишком много запросов. Попробуйте через 15 минут."),
});

// Resending verification emails triggers outbound mail and needs a tighter budget.
const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitedHandler("Слишком много запросов на отправку письма. Попробуйте позже."),
});

// Payment creation writes pending orders and calls the external payment provider.
// Bound bursts per client IP; authentication runs first on these routes.
const paymentCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitedHandler("Слишком много попыток создать платёж. Попробуйте через 15 минут."),
});

const adminActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Run before authentication so invalid-token traffic is rate-limited too.
  // express-rate-limit's default IP key normalizes IPv6 addresses safely.
  handler: rateLimitedHandler("Слишком много административных операций. Попробуйте позже."),
});

const imageUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: buildPinImageRateLimitKey,
  handler: rateLimitedHandler("Слишком много загрузок изображений. Попробуйте позже."),
});

const { generateImage, checkImage, imageTaskResult, providerTaskError, quoteImageTask } = require("./gptunnel");
const { register, login, verifyToken } = require("./auth");
const supabase = require("./supabase");
const { buildPinScheduleSnapshot, isSamePinScheduleRequest, normalizePinterestDestinationUrl, classifyLegacyScheduleAccount, getScheduleRetryability, getScheduleFailureReason, sanitizeScheduleForClient } = require("./pinterestSchedule");
const { pinterestScheduleLimiter } = require("./pinterestRateLimit");
const { analyzeSite } = require("./analyze");
const { suggestKeywords } = require("./keywordIdeas");
const { asError } = require("./dbErrors");
const { generateBoards } = require("./boards");
const { generatePins } = require("./pins");
const { markGenerationFailure, generationSaveFailedError } = require("./generationFailure");
const { calculateGenerationReservation, calculateQuotedGenerationPricing, ceilCredits } = require("./generationPricing");
const { uploadPinImage, rehostImage, deletePinImageIfUnreferenced } = require("./storage");
const { reconcileStalePinImageUploads, quarantineStalePinImageUploads, inspectQuarantinedPinImageObjects, inspectBlockedPinImageRetentionQueue, retryFailedPinImageDeletions, processPendingPinImageRetentionQueue } = require("./pinImageLifecycle");
const { validateDevTopupRequest } = require("./devTopup");
const mail = require("./mail");
const passwordReset = require("./password-reset");
const emailVerify = require("./email-verify");
const billing = require("./billing");
const creditsBilling = require("./creditsBilling");
const creditPacks = require("./creditPacks");
const prodamus = require("./prodamus");
const { requireTariff, getTariffState, normalizePlan } = require("./tariff");

/**
 * A 402 always means the same thing to the customer — the balance cannot cover this
 * operation — so it always carries the same code. The detailed Russian message is kept for
 * logs and support; the client renders the code in the user's own language.
 */
/**
 * A 404 always means "this object is gone or is not yours", so it always carries a code
 * naming the entity. The message is kept, including the deliberate refusal to reveal whether
 * a foreign object exists.
 */
/**
 * A 422 the customer can act on carries a code so the interface can explain it in the
 * person's own language. Internal contract violations keep the server text only.
 */
/**
 * A 409 that names a precondition the customer can satisfy carries a code; the Russian text
 * stays for logs, support and existing clients.
 */
function conflictError(code, message) {
  const error = httpError(409, message);
  error.details = { ...(error.details || {}), code };
  return error;
}

function notFoundError(code, message) {
  const error = httpError(404, message);
  error.details = { ...(error.details || {}), code };
  return error;
}

function insufficientCreditsError(message) {
  const error = httpError(402, message);
  error.details = { ...(error.details || {}), code: "insufficient_credits" };
  return error;
}
const { isTariffSelfSelectEnabled } = require("./tariffSelfSelect");

// Загрузка своих изображений пинов (замена временных ссылок GPTunnel на постоянные)
const multer = require("multer");
const webhookMultipart = multer({
  storage: multer.memoryStorage(),
  limits: { fields: 80, fieldSize: 16 * 1024, files: 0 },
}).none();
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 10,
    fieldSize: 16 * 1024,
    parts: 11,
  },
  fileFilter: (req, file, cb) => {
    if (!isAllowedPinImageUploadMime(file.mimetype)) {
      const error = new Error("unsupported_image_type");
      error.code = "unsupported_image_type";
      return cb(error);
    }
    cb(null, true);
  },
});

if (!process.env.GPTUNNEL_API_KEY) {
  logWarning("index.event_020");
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = require("./bearerToken").extractBearerToken(header);
    if (!token) throw new Error("Нет токена");
    const decoded = verifyToken(token);
    if (!decoded.userId) throw new Error("Нет userId в токене");

    // Password reset increments token_version; older JWTs are then rejected.
    const { data: account, error } = await supabase
      .from("users")
      .select("token_version")
      .eq("id", decoded.userId)
      .maybeSingle();

    if (error) {
      logError("index.event_019");
      return res.status(503).json({ error: "Сервис авторизации временно недоступен" });
    }
    if (!account || Number(decoded.tokenVersion || 0) !== Number(account.token_version || 0)) {
      return res.status(401).json({ error: "Не авторизован" });
    }

    req.userId = decoded.userId;
    next();
  } catch (e) {
    res.status(401).json({ error: "Не авторизован" });
  }
}

// Единый обработчик: коды 4xx отдают понятное сообщение, 5xx — не раскрывают внутренности (B10)
// The responder lives in its own module so it can be tested directly: a boundary that
// silently dropped machine codes was invisible while it was an inner function here.
const loginLockout = require("./loginLockout");
const { respondWithError: handleError, sendError } = require("./httpErrorResponse");
const { isMissingRow } = require("./dbErrors");

app.get("/", (req, res) => {
  res.send("OK");
});

// Liveness probe: cheap, dependency-free, safe for platform health checks.
// It intentionally does not touch the database, so a slow query can never turn
// a healthy process into a restart loop.
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// Readiness probe: proves the process can actually serve requests that need the
// database. Without it a deployment whose database credentials or network are
// broken still reports healthy and receives traffic that must fail.
const READINESS_TIMEOUT_MS = 2500;
app.get("/ready", async (req, res) => {
  let timer = null;
  try {
    const probe = supabase
      .from("users")
      .select("id")
      .limit(1);
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("readiness probe timed out")), READINESS_TIMEOUT_MS);
      if (typeof timer.unref === "function") timer.unref();
    });
    const { error } = await Promise.race([probe, timeout]);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    logError("index.event_023", e);
    res.status(503).json({ ok: false, error: "database_unavailable" });
  } finally {
    if (timer) clearTimeout(timer);
  }
});

// --- Аутентификация ---

app.post("/register", authLimiter, async (req, res) => {
  try {
    const email = validateEmail(req.body && req.body.email);
    const password = validatePassword(req.body && req.body.password);
    const name = optionalString(req.body && req.body.name, { max: 80 });
    const surname = optionalString(req.body && req.body.surname, { max: 80 });
    const preferredLanguage = optionalString(req.body && req.body.preferred_language, { max: 16 });
    const termsAccepted = req.body && req.body.terms_accepted === true;
    const result = await register(email, password, name, surname, preferredLanguage, termsAccepted);
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/login", authLimiter, loginAccountLimiter, async (req, res) => {
  try {
    const email = validateEmail(req.body && req.body.email);
    const password = validatePassword(req.body && req.body.password);
    const result = await login(email, password);
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// Подтверждение email: переход по ссылке из письма (применяем токен).
// Два режима одного роута:
//  - прямой переход по ссылке (Accept: text/html) — классический 302-редирект
//    на фронт: успех → /login?verified=1, ошибка → /verify-email?status=error;
//  - вызов со страницы VerifyEmail.tsx (Accept: application/json) — JSON-ответ,
//    страница сама показывает успех/ошибку и делает переход ко входу.
app.post("/verify-email", verifyLimiter, async (req, res) => {
  try {
    await emailVerify.applyVerification(req.body && req.body.token);
    res.json({ ok: true });
  } catch (e) {
    handleError(res, e, e && e.httpStatus >= 500
      ? "Внутренняя ошибка сервера, попробуйте позже"
      : undefined);
  }
});

// Повторная отправка письма подтверждения.
// Два режима: с Authorization-токеном (кабинет) или с { email } в теле (страница входа).
// Ответ всегда ok:true — эндпоинт не раскрывает, существует ли такой email.
app.post("/resend-verification", resendVerificationLimiter, async (req, res) => {
  try {
    let userIdFromToken = null;
    try {
      const header = req.headers.authorization || "";
      const token = require("./bearerToken").extractBearerToken(header);
      if (token) {
        const decoded = verifyToken(token);
        if (decoded.userId) {
          // Authenticated resend must enforce the same session-version fence
          // as requireAuth; password-reset JWTs must not remain active here.
          const { data: account, error: accountError } = await supabase
            .from("users")
            .select("token_version")
            .eq("id", decoded.userId)
            .maybeSingle();
          if (accountError) {
            logError("index.event_018");
            throw httpError(503, "Сервис подтверждения email временно недоступен — попробуйте позже");
          }
          if (
            account &&
            Number(decoded.tokenVersion || 0) === Number(account.token_version || 0)
          ) {
            userIdFromToken = decoded.userId;
          }
        }
      }
    } catch (e) {
      if (e && e.httpStatus === 503) throw e;
      userIdFromToken = null; // invalid or revoked token falls back to generic anonymous mode
    }
    const result = await emailVerify.resendVerification(
      req.body && req.body.email,
      userIdFromToken
    );
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// Забыли пароль: одинаковый ответ для всех email (защита от перебора)
app.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const result = await passwordReset.requestReset(
      req.body && req.body.email,
      req.body && req.body.frontendUrl,
      req.body && req.body.language
    );
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// Смена пароля по одноразовому токену
app.post("/reset-password", authLimiter, async (req, res) => {
  try {
    const result = await passwordReset.applyReset(
      req.body && req.body.token,
      req.body && req.body.password
    );
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/me", requireAuth, async (req, res) => {
  try {
    // select("*") — не падает, если какой-то колонки нет в схеме (причина 404 на /me)
    const { data: row, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", req.userId)
      .single();

    // A missing row means the account is gone; a failed query does not. Answering 404 for a
    // database blink told a signed-in customer their account had disappeared, and hid a real
    // outage behind a code the UI presents as "sign in again". PGRST116 is PostgREST's "no rows".
    if (error && error.code !== "PGRST116") {
      logError("index.event_024", error);
      throw httpError(503, "Сервис профиля временно недоступен — попробуйте позже");
    }
    if (!row) throw notFoundError("user_not_found", "Пользователь не найден");

    // Keep the profile payload aligned with the same authoritative entitlement
    // resolver used by protected API routes. Raw users.* fields can be stale
    // after a successful subscription or an expired paid period.
    const tariffState = await getTariffState(req.userId);
    const effectivePlan = tariffState.plan;

    res.json({
      id: row.id,
      email: row.email,
      name: row.name ?? null,
      surname: row.surname ?? null,
      credits_balance: row.credits_balance ?? 0,
      // Legacy compatibility field now reflects the effective entitlement.
      subscription_tier: effectivePlan === "none" ? "free" : effectivePlan,
      onboarded: row.onboarded ?? false,
      tariff_plan: effectivePlan,
      tariff_period_end: tariffState.periodEnd,
      subscription_active: tariffState.active,
      payment_provider: "prodamus",
      email_verified: row.email_verified ?? true, // миграция 005; нет колонки — считаем подтверждённым
      preferred_language: row.preferred_language || "en",
      is_admin: !!row.is_admin,
    });
  } catch (e) {
    handleError(res, e);
  }
});

// --- Самообслуживание аккаунта: экспорт данных и удаление ---

// Экспорт всех данных аккаунта. Секреты (OAuth-токены, хеш пароля, счётчики
// сессий) в выгрузку не попадают — только колонки из allowlist.
app.get("/account/export", requireAuth, async (req, res) => {
  try {
    const payload = await buildAccountExport(req.userId);
    res.setHeader("Content-Disposition", 'attachment; filename="pinposy-account-export.json"');
    res.json(payload);
  } catch (e) {
    handleError(res, e);
  }
});

// Запрос на удаление аккаунта. Требует повторного ввода пароля, затем
// закрывает доступ (инкремент token_version аннулирует все сессии) и
// фиксирует запрос. Данные здесь не удаляются — физическая очистка идёт
// отдельным контролируемым этапом и никогда не запускается из этого метода.
app.post("/account/deletion-request", requireAuth, authLimiter, async (req, res) => {
  try {
    const result = await requestAccountDeletion({
      userId: req.userId,
      password: req.body && req.body.password,
      confirmationMethod: "password_reauth",
    });
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// Обновление профиля: имя и фамилия
app.patch("/me", requireAuth, async (req, res) => {
  try {
    const { validateLen } = require("./validate");
    const upd = {};
    if (req.body && req.body.name !== undefined) upd.name = validateLen(req.body.name, 80, "Имя");
    if (req.body && req.body.surname !== undefined) upd.surname = validateLen(req.body.surname, 80, "Фамилия");
    if (req.body && req.body.preferred_language !== undefined) {
      const requested = String(req.body.preferred_language || "").toLowerCase();
      if (!["en", "ru", "es", "pt", "de", "fr", "zh"].includes(requested)) throw httpError(422, "Unsupported preferred language");
      upd.preferred_language = requested;
    }
    if (Object.keys(upd).length === 0) throw httpError(422, "Нечего обновлять");
    const { data, error } = await supabase
      .from("users")
      .update(upd)
      .eq("id", req.userId)
      .select("id, email, name, surname, credits_balance, tariff_plan, preferred_language, is_admin")
      .single();
    if (error) throw httpError(500, "Не удалось обновить профиль — нужно применить миграцию 003");
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

// Онбординг: финал визарда — сайт + комментарий о продукте + первая запись проекта
app.patch("/me/onboarding", requireAuth, async (req, res) => {
  try {
    // Ссылку можно пропустить (пустая допустима), но непустая — только http/https
    const websiteUrl = optionalString(req.body && req.body.websiteUrl, { max: 2048 });
    const productComment =
      optionalString(req.body && req.body.productComment, { max: 2000 }) || "";

    // website_url belongs to projects, not users. Writing it to users caused
    // HTTP 500 on installations where that optional column does not exist.
    // The same rule as project creation: an address that can never be analysed is refused now, not after
    // the customer has finished onboarding and every analysis has failed.
    const normalizedWebsiteUrl = websiteUrl ? assertPublicWebsiteAddress(validateUrl(websiteUrl)) : null;
    // The project created below is what every later generation takes its content language from, so it
    // must be the language the customer actually reads. "ru" was hard-coded here, which handed every
    // non-Russian customer a Russian-language project until they noticed and fixed it by hand.
    const requestedLanguage = optionalString(req.body && (req.body.language || req.body.preferredLanguage), { max: 8 });
    // validateEnum has no "absent" mode: an omitted language must fall through to the profile, not fail.
    const projectLanguage = requestedLanguage
      ? validateEnum(requestedLanguage.toLowerCase(), PIN_CONTENT_LANGUAGES, undefined, "Язык")
      : null;
    const upd = { onboarded: true };

    const { data, error } = await supabase
      .from("users")
      .update(upd)
      .eq("id", req.userId)
      .select("id, email, onboarded, tariff_plan, preferred_language")
      .single();

    if (error) {
      logError("index.event_017");
      throw httpError(500, "Не удалось сохранить онбординг. Проверьте, что миграция 004 применена в Supabase.");
    }

    // Первая запись проекта: user_id, website_url, goal = комментарий о продукте
    const { data: existing, error: lookupError } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", req.userId)
      .limit(1);
    if (lookupError) {
      logError("index.event_016");
    } else if (!existing || existing.length === 0) {
      const { error: projError } = await supabase.from("projects").insert({
        user_id: req.userId,
        website_url: normalizedWebsiteUrl,
        goal: productComment,
        // Explicit choice, then the profile's language, then the historical default.
        language: projectLanguage || (data && data.preferred_language) || "ru",
      });
      if (projError) {
        // Онбординг уже сохранён — проект можно создать позже из кабинета.
        logError("index.event_015");
      }
    } else {
      // Пользователь мог создать проект до завершения онбординга — обновляем его,
      // вместо того чтобы молча терять введённые на визарде сайт и описание.
      const projectPatch = {};
      if (normalizedWebsiteUrl) projectPatch.website_url = normalizedWebsiteUrl;
      if (productComment) projectPatch.goal = productComment;
      if (Object.keys(projectPatch).length > 0) {
        const { error: projectUpdateError } = await supabase
          .from("projects")
          .update(projectPatch)
          .eq("id", existing[0].id)
          .eq("user_id", req.userId);
        if (projectUpdateError) {
          logError("index.event_014");
        }
      }
    }

    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

// ВРЕМЕННО (до запуска платежей): выбор тарифа для проверки «замочков».
// При подключении платёжки заменить на webhook платёжного провайдера.
app.patch("/me/tariff", requireAuth, async (req, res) => {
  try {
    // Production tariff changes are always admin-only. The self-select flag
    // is honored exclusively in non-production environments.
    if (!isTariffSelfSelectEnabled()) {
      const { data: me, error: adminLookupError } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", req.userId)
        .single();
      // A failed lookup must not be answered as "you have no right": an administrator whose
      // connection dropped would be told they lack permission, and would stop asking for the fix.
      if (adminLookupError && !isMissingRow(adminLookupError)) {
        logError("index.event_028", adminLookupError);
        throw httpError(503, "Сервис тарифов временно недоступен — попробуйте позже");
      }
      if (!me || !me.is_admin) {
        throw httpError(
          403,
          "Тариф меняется после оплаты. Выберите тариф на странице «Тарифы» — ссылка на оплату придёт с сервера."
        );
      }
    }
    const plan = req.body && req.body.plan;
    if (!["none", "analytics", "start", "pro", "agency"].includes(plan)) {
      throw httpError(422, "plan: допустимые значения — none, analytics, start, pro, agency");
    }
    const { data, error } = await supabase
      .from("users")
      .update({ tariff_plan: plan })
      .eq("id", req.userId)
      .select("id, email, onboarded, tariff_plan")
      .single();
    if (error) {
      throw httpError(500, "Не удалось сохранить тариф — нужно применить миграцию 004 (db/migrations/004_onboarding.sql)");
    }
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

// --- Проекты ---

app.post("/projects", requireAuth, async (req, res) => {
  try {
    let website_url = optionalString(req.body && req.body.website_url, { max: 2048 });
    if (website_url) website_url = assertPublicWebsiteAddress(validateUrl(website_url), "Адрес сайта");
    const niche = optionalString(req.body && req.body.niche, { max: 120 }) || "";
    const language = optionalString(req.body && req.body.language, { max: 10 }) || "en";
    const goal = optionalString(req.body && req.body.goal, { max: 500 }) || "";
    const tone = optionalString(req.body && req.body.tone, { max: 500 }) || "";

    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: req.userId, website_url, niche, language, goal, tone })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(serializeProjectForClient(data));
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/projects", requireAuth, async (req, res) => {
  try {
    const data = await fetchAllPages((from, to) => supabase
      .from("projects")
      .select("*")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to));
    res.json(sortProjectsForProvisioning(data).map(serializeProjectForClient));
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/projects/:id", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();
    // Same distinction as /me: zero rows is a missing project, a failed query is an outage that
    // must not be reported to the owner as "your project is gone".
    if (error && error.code !== "PGRST116") {
      logError("index.event_026", error);
      throw httpError(503, "Сервис проектов временно недоступен — попробуйте позже");
    }
    if (!data) throw notFoundError("project_not_found", "Проект не найден");
    res.json(serializeProjectForClient(data));
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/projects/:id/analyze", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();

    // A failed query is an outage, not a deleted project: the same rule as /me and the board lookups.
    if (fetchError && !isMissingRow(fetchError)) {
      logError("index.event_027", fetchError);
      throw httpError(503, "Сервис проектов временно недоступен — попробуйте позже");
    }
    if (!project) throw notFoundError("project_not_found", "Проект не найден");
    if (!project.website_url) throw validationError("project_url_required", "У проекта не указан URL сайта");

    const analysis = await analyzeSite(project.website_url);

    const { data: updated, error: updateError } = await supabase
      .from("projects")
      .update({
        niche: analysis.niche,
        site_summary: analysis.summary,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      // Compare-and-swap the analyzed URL: if the owner changed the project
      // website while the AI request was running, never attach stale analysis
      // to the new URL.
      .eq("website_url", project.website_url)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      throw httpError(409, "URL сайта изменился во время анализа. Запустите анализ ещё раз.");
    }

    // Keep the owner identifier private in the analyzed-project response too.
    res.json(serializeProjectForClient(updated));
  } catch (e) {
    handleError(res, e);
  }
});

// --- Ключевые слова ---

// Keyword ideas for the user's niche. These are model suggestions, not measured
// search volumes: the endpoint returns nothing that looks like a metric, because
// Pinterest does not expose search volume to apps.
app.post("/keywords", requireAuth, aiLimiter, async (req, res) => {
  try {
    const requestedCount = req.body && req.body.count != null ? Number(req.body.count) : 12;
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 20) {
      throw httpError(422, "count: допустимо целое число от 1 до 20");
    }

    let topic = optionalString(req.body && req.body.topic, { max: 200 });
    let niche = null;

    if (!topic || !(req.body && req.body.language)) {
      const { data: projects, error: projectError } = await supabase
        .from("projects")
        .select("niche, site_summary, preferred_language")
        .eq("user_id", req.userId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (projectError) throw asError(projectError);
      const project = Array.isArray(projects) ? projects[0] : null;
      niche = project ? optionalString(project.niche, { max: 200 }) : null;
      topic = topic || niche;
      if (!topic) {
        throw httpError(
          422,
          "Укажите тему: у вашего профиля ещё нет ниши сайта. Проанализируйте сайт или введите тему вручную."
        );
      }
      if (!(req.body && req.body.language) && project && project.preferred_language) {
        req.body = { ...(req.body || {}), language: project.preferred_language };
      }
    }

    const language = validateEnum(
      req.body && req.body.language,
      ["en", "ru", "es", "pt", "de", "fr", "zh"],
      "ru",
      "Язык"
    );

    const ideas = await suggestKeywords({ topic, niche, language, count: requestedCount });

    res.json({ topic, language, count: ideas.length, items: ideas });
  } catch (e) {
    handleError(res, e);
  }
});

// --- Доски ---

app.post("/projects/:id/boards/generate", requireAuth, aiLimiter, requireTariff(["standard", "pro", "agency", "start"]), async (req, res) => {
  try {
    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();
    if (fetchError && !isMissingRow(fetchError)) {
      logError("index.event_027", fetchError);
      throw httpError(503, "Сервис проектов временно недоступен — попробуйте позже");
    }
    if (!project) throw notFoundError("project_not_found", "Проект не найден");

    const ideas = await generateBoards(project);

    const rows = ideas.map((b) => ({
      project_id: project.id,
      title: b.title,
      description: b.description,
      status: "new",
    }));

    const { data: inserted, error: insertError } = await supabase.from("boards").insert(rows).select();
    if (insertError) throw insertError;

    // Generated boards use the same public response contract as every other
    // board endpoint; database-only idempotency metadata stays server-side.
    res.status(201).json((inserted || []).map(serializeBoardForClient));
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/projects/:id/boards", requireAuth, async (req, res) => {
  try {
    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();
    if (fetchError && !isMissingRow(fetchError)) {
      logError("index.event_027", fetchError);
      throw httpError(503, "Сервис проектов временно недоступен — попробуйте позже");
    }
    if (!project) throw notFoundError("project_not_found", "Проект не найден");

    const data = await fetchAllPages((from, to) => supabase
      .from("boards")
      .select("*")
      .eq("project_id", req.params.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to));

    // Keep legacy board-list responses aligned with the newer /boards API:
    // internal create-request fingerprints/keys are never part of the client contract.
    res.json(data.map(serializeBoardForClient));
  } catch (e) {
    handleError(res, e);
  }
});

async function getBoardWithOwnerCheck(boardId, userId) {
  const { data: board, error } = await supabase
    .from("boards")
    .select("*, projects(user_id, niche, tone, goal, language)")
    .eq("id", boardId)
    .single();
  // Same distinction as /me: a failed lookup is an outage, not a deleted board. A customer who
  // reads "доска не найдена" during a database blink concludes their work is gone.
  if (error && error.code !== "PGRST116") {
    logError("index.event_025", error);
    throw httpError(503, "Сервис досок временно недоступен — попробуйте позже");
  }
  if (!board) throw notFoundError("board_not_found", "Доска не найдена");
  if (!isOwnedByUser(board.projects && board.projects.user_id, userId)) throw notFoundError("board_not_found", "Доска не найдена");
  return board;
}

async function getPinWithOwnerCheck(pinId, userId) {
  const { data: pin, error } = await supabase
    .from("pins")
    .select("*, boards(id, title, description, projects(user_id, niche, tone))")
    .eq("id", pinId)
    .single();
  if (error && error.code !== "PGRST116") {
    logError("index.event_025", error);
    throw httpError(503, "Сервис досок временно недоступен — попробуйте позже");
  }
  if (!pin) throw notFoundError("pin_not_found", "Пин не найден");
  if (!isOwnedByUser(pin.boards && pin.boards.projects && pin.boards.projects.user_id, userId)) throw notFoundError("pin_not_found", "Пин не найден");
  return pin;
}

// --- Пины ---

app.patch("/pins/:id", requireAuth, async (req, res) => {
  try {
    const pin = await getPinWithOwnerCheck(req.params.id, req.userId);
    const update = buildPinPatch(req.body, ASPECT_RATIOS);

    const { data, error } = await supabase
      .from("pins")
      .update(update)
      .eq("id", req.params.id)
      .eq("board_id", pin.board_id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFoundError("pin_not_found", "Пин больше не существует");
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/pins/:id/status", requireAuth, async (req, res) => {
  try {
    const pin = await getPinWithOwnerCheck(req.params.id, req.userId);
    const status = req.body && !Array.isArray(req.body) ? req.body.status : undefined;
    if (!["approved", "rejected"].includes(status)) throw httpError(422, "Некорректный статус");

    // Never reject a pin whose publication may be live or need reconciliation.
    if (status === "rejected") {
      const { assertPinCanBeRejected } = require("./pinStatusGuard");
      await assertPinCanBeRejected(supabase, req.userId, req.params.id);
    }
    // Section 129: nor let a pin that already went out come back as "approved".
    if (status === "approved") {
      const { assertPinCanBeApproved } = require("./pinStatusGuard");
      await assertPinCanBeApproved(supabase, req.userId, req.params.id);
    }

    const { data, error } = await supabase
      .from("pins")
      .update({ status })
      .eq("id", req.params.id)
      .eq("board_id", pin.board_id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFoundError("pin_not_found", "Пин больше не существует");
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

// Multer runs before the async route handler, so translate its known errors here
// instead of letting Express return a generic HTML 500 response.
function handlePinImageUpload(req, res, next) {
  imageUpload.single("image")(req, res, (error) => {
    if (!error) return next();
    const response = serializePinImageUploadError(error);
    if (response) return res.status(response.status).json({ error: response.message, code: response.code });
    return next(error);
  });
}

// Своя картинка пина: постоянное хранилище вместо временных ссылок GPTunnel
app.post("/pins/:id/image", requireAuth, imageUploadLimiter, handlePinImageUpload, async (req, res) => {
  try {
    const pin = await getPinWithOwnerCheck(req.params.id, req.userId);
    if (!req.file) throw validationError("image_upload_required", "Передайте файл в поле image (PNG/JPG/WebP/GIF, до 5 МиБ)");
    const url = await uploadPinImage(req.file);
    let updateQuery = supabase
      .from("pins")
      .update({ image_url: url })
      .eq("id", req.params.id)
      .eq("board_id", pin.board_id);
    updateQuery = applyPinImageCompareAndSwapFilter(updateQuery, pin.image_url);
    const { data, error } = await updateQuery.select().maybeSingle();
    if (error || !data) {
      // Compare-and-swap prevents a slower upload from overwriting a newer
      // image. A missing row means another request changed image_url first.
      await deletePinImageIfUnreferenced(url).catch((cleanupError) => {
        logError("index.event_013");
      });
      if (error) throw error;
      throw httpError(409, "Изображение пина уже изменилось. Обновите карточку и повторите загрузку.");
    }
    if (pin.image_url && pin.image_url !== url) {
      await deletePinImageIfUnreferenced(pin.image_url).catch((cleanupError) => {
        logError("index.event_012");
      });
    }
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/pins/:id/regenerate", requireAuth, aiLimiter, requireTariff(["standard", "pro", "agency", "start"]), async (req, res) => {
  let claimToken = null;
  let idempotencyKey = req.get("Idempotency-Key");
  let requestStarted = false;
  try {
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw httpError(422, "Для перегенерации требуется корректный Idempotency-Key");
    }
    const pin = await getPinWithOwnerCheck(req.params.id, req.userId);
    const instruction = optionalString(req.body && req.body.instruction, { max: 300 }) || "";
    const model = validateEnum(pin.model_used, Object.keys(MODEL_PRICES), "flux-schnell", "Модель");
    const cost = ceilCredits((MODEL_PRICES[model] || 15) * MARKUP);
    const prompt = `${pin.title}. ${pin.description}. ${instruction}`.trim();
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify({
      pinId: String(pin.id), model, prompt, amount: cost,
    })).digest("hex");

    const { data: state, error: beginError } = await supabase.rpc("begin_pin_regeneration_request", {
      p_user_id: String(req.userId), p_pin_id: req.params.id,
      p_idempotency_key: idempotencyKey, p_fingerprint: fingerprint,
      p_model: model, p_prompt: prompt, p_amount: cost,
    });
    if (beginError) throw beginError;
    if (state.status === "expired") {
      return res.status(410).json({
        error: "Срок хранения результата перегенерации истёк. Используйте новый ключ идемпотентности для новой операции.",
        code: "idempotency_result_expired",
      });
    }
    if (state.status === "completed") return res.status(200).json(state.pin);
    if (state.status === "processing") {
      res.set("Retry-After", "5");
      return sendError(res, 409, "Перегенерация уже выполняется. Повторите запрос с тем же ключом.", "regeneration_in_progress", { retryAfterSeconds: 5 });
    }
    if (state.status === "unknown" || state.status === "failed") {
      return sendError(res, 409, "Исход предыдущей перегенерации не подтверждён. Автоматический новый запуск заблокирован.", "regeneration_outcome_unknown");
    }
    if (state.status !== "started" && state.status !== "resume") throw httpError(500, "Неизвестное состояние перегенерации");
    claimToken = state.claim_token;
    requestStarted = true;
    if (typeof claimToken !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claimToken)) {
      throw httpError(500, "Не удалось получить право на перегенерацию");
    }

    // A fresh regeneration must be quoted for its exact payload before any
    // provider submission. Existing task IDs are legacy/in-flight work and
    // must be recovered without creating a second billable task.
    let quotedCreditCost = cost;
    if (!state.provider_task_id) {
      const { data: savedQuote, error: savedQuoteError } = await supabase
        .from("pin_regeneration_requests")
        .select("provider_quote_price,provider_quote_currency,provider_quote_model,provider_quote_aspect_ratio,amount")
        .eq("user_id", String(req.userId))
        .eq("idempotency_key", idempotencyKey)
        .single();
      if (savedQuoteError) throw savedQuoteError;

      if (savedQuote.provider_quote_price != null) {
        if (savedQuote.provider_quote_currency !== "RUB" ||
            savedQuote.provider_quote_model !== model ||
            savedQuote.provider_quote_aspect_ratio !== "2:3" ||
            !Number.isFinite(Number(savedQuote.provider_quote_price)) ||
            Number(savedQuote.provider_quote_price) <= 0) {
          throw httpError(502, "Сохранённая котировка перегенерации повреждена или не соответствует запросу.");
        }
        quotedCreditCost = Number(savedQuote.amount);
      } else {
        const quote = await quoteImageTask(prompt, model, "2:3");
        quotedCreditCost = ceilCredits(quote.price * MARKUP);
        const { error: quoteError } = await supabase.rpc("record_pin_regeneration_quote", {
          p_user_id: String(req.userId),
          p_idempotency_key: idempotencyKey,
          p_claim_token: claimToken,
          p_quote_price: quote.price,
          p_quote_currency: quote.currency,
          p_quote_model: quote.model,
          p_quote_aspect_ratio: quote.params.aspect_ratio,
          p_user_credits: quotedCreditCost,
        });
        if (quoteError) throw quoteError;
      }
    }

    // New provider submissions must be covered by the same reservation pool
    // used by multi-pin generation. Legacy requests with a durable provider
    // task ID are recovered without creating a second reservation.
    if (!state.provider_task_id) {
      const { error: reservationError } = await supabase.rpc("reserve_pin_regeneration_credits", {
        p_user_id: String(req.userId),
        p_idempotency_key: idempotencyKey,
        p_claim_token: claimToken,
      });
      if (reservationError) {
        await settleQuery(supabase.rpc("update_pin_regeneration_request", {
          p_user_id: String(req.userId),
          p_idempotency_key: idempotencyKey,
          p_claim_token: claimToken,
          // No provider task was submitted; keep the idempotency key
          // resumable so a top-up or transient DB recovery can retry safely.
          p_status: "unknown",
          p_error_code: "regeneration_reservation_failed",
        }), () => logError("index.event_011"));
        requestStarted = false;
        if (/insufficient available credits/i.test(reservationError.message || "")) {
          throw insufficientCreditsError("Недостаточно доступных кредитов для перегенерации");
        }
        throw reservationError;
      }
    }

    const recordProviderOutcome = async (outcome, status) => {
      // Manual refund reconciliation may enrich a previously-null provider
      // refund fact. Preserve that audited value when replaying the original
      // provider failure, rather than sending null and creating a false
      // "conflicting replay".
      let reconciledRefund = status === "failed" ? outcome.refunded : null;
      if (status === "failed" && reconciledRefund == null) {
        const { data: savedOutcome, error: savedOutcomeError } = await supabase
          .from("pin_regeneration_requests")
          .select("provider_refunded")
          .eq("user_id", String(req.userId))
          .eq("idempotency_key", idempotencyKey)
          .single();
        if (savedOutcomeError) throw savedOutcomeError;
        if (savedOutcome && savedOutcome.provider_refunded != null) {
          reconciledRefund = savedOutcome.provider_refunded;
        }
      }
      const { error: outcomeError } = await supabase.rpc("record_pin_regeneration_provider_outcome", {
        p_user_id: String(req.userId),
        p_idempotency_key: idempotencyKey,
        p_claim_token: claimToken,
        p_provider_task_id: outcome.taskId,
        p_provider_status: status,
        p_provider_price: outcome.price == null ? null : outcome.price,
        p_provider_refunded: reconciledRefund,
        p_provider_error_code: status === "failed" ? outcome.errorCode : null,
        p_provider_error_title: status === "failed" ? outcome.errorTitle : null,
      });
      if (outcomeError) throw outcomeError;
    };

    let image = null;
    let storedUrl = state.storage_url || null;
    if (!storedUrl && state.provider_result_url) {
      storedUrl = await rehostImage(state.provider_result_url, { idempotencyKey: state.provider_idempotency_key });
    }
    if (storedUrl && state.provider_task_id && state.provider_price != null) {
      // A previously rehosted result may be resumed after a transient failure;
      // the provider outcome RPC is idempotent for an identical terminal fact.
      await recordProviderOutcome({
        taskId: state.provider_task_id,
        price: state.provider_price,
      }, "done");
    }
    if (!storedUrl) {
      // Resume a provider task already recorded in the journal instead of
      // submitting another create request after a client/network retry.
      // Its provider cost may already have been incurred: always reconcile that
      // task even if the user's current balance has since changed. The atomic
      // completion RPC remains the authority for the actual credit debit.
      if (state.provider_task_id && !state.provider_result_url) {
        const task = await checkImage(state.provider_task_id);
        if (task && (task.status === "queued" || task.status === "running")) {
          res.set("Retry-After", "10");
          return res.status(202).json({ status: "processing", code: "regeneration_pending", retryAfterSeconds: 10 });
        }
        if (task && task.status === "failed") {
          throw providerTaskError({ ...task, id: state.provider_task_id });
        }
        if (!task || task.status !== "done") {
          throw new Error("Provider task has no confirmed result yet");
        }
        image = imageTaskResult(task);
      } else {
        // Check balance only before a new billable provider submission. Never
        // block recovery/polling of a task that may already have been charged.
        const balance = await getBalance(req.userId);
        if (balance < quotedCreditCost) throw insufficientCreditsError("Недостаточно кредитов для перегенерации");
        image = await generateImage(prompt, model, "2:3", state.provider_idempotency_key, {
          // Persist the provider task ID as soon as the provider accepts it,
          // before the first poll or any later network operation can fail.
          onTaskUpdate: async (taskId) => {
            const { error: taskJournalError } = await supabase.rpc("update_pin_regeneration_request", {
              p_user_id: String(req.userId), p_idempotency_key: idempotencyKey,
              p_claim_token: claimToken, p_status: "processing", p_provider_task_id: taskId,
            });
            if (taskJournalError) throw taskJournalError;
          },
        });
      }

      if (image && image.pending && image.taskId) {
        const { error: journalError } = await supabase.rpc("update_pin_regeneration_request", {
          p_user_id: String(req.userId), p_idempotency_key: idempotencyKey, p_claim_token: claimToken,
          p_status: "processing", p_provider_task_id: image.taskId,
        });
        if (journalError) throw journalError;
        res.set("Retry-After", "10");
        return res.status(202).json({ status: "processing", code: "regeneration_pending" });
      }
      if (!image || !image.url || image.price == null || !image.taskId) {
        throw new Error("Provider returned no confirmed image result");
      }
      // Record provider spend and terminal state before image rehosting. If
      // storage fails, a retry can recover the same provider task without
      // losing its financial outcome or submitting a second task.
      await recordProviderOutcome(image, "done");
      const { error: resultError } = await supabase.rpc("update_pin_regeneration_request", {
        p_user_id: String(req.userId), p_idempotency_key: idempotencyKey, p_claim_token: claimToken,
        p_status: "processing", p_provider_task_id: image.taskId,
        p_provider_result_url: image.url, p_provider_price: image.price,
      });
      if (resultError) throw resultError;
      storedUrl = await rehostImage(image.url, { idempotencyKey: state.provider_idempotency_key });
    }

    // Settle against the provider's authoritative terminal price, not the
    // pre-submission estimate. The journal retains the image result if a
    // required top-up cannot be reserved; retrying the same key won't resubmit.
    const actualPrice = state.provider_price != null
      ? Number(state.provider_price)
      : Number(image && image.price);
    if (!Number.isFinite(actualPrice) || actualPrice <= 0) {
      // Section 121: the image exists on the provider side and cannot be posted - same consequence as
      // an unsaved result, so it must not invite a retry that generates (and charges) again.
      throw generationSaveFailedError("Провайдер не вернул корректную фактическую стоимость изображения.");
    }
    const actualCharge = ceilCredits(actualPrice * MARKUP);
    const { error: settlementResizeError } = await supabase.rpc("resize_pin_regeneration_credit_reservation", {
      p_user_id: String(req.userId),
      p_idempotency_key: idempotencyKey,
      p_claim_token: claimToken,
      p_amount: actualCharge,
    });
    if (settlementResizeError) {
      if (/insufficient available credits/i.test(settlementResizeError.message || "")) {
        throw insufficientCreditsError("Фактическая стоимость выше резерва. Пополните баланс и повторите перегенерацию с тем же ключом.");
      }
      throw settlementResizeError;
    }

    const { data: completed, error: completeError } = await supabase.rpc("complete_pin_regeneration_request", {
      p_user_id: String(req.userId), p_idempotency_key: idempotencyKey,
      p_claim_token: claimToken, p_storage_url: storedUrl,
    });
    if (completeError) {
      if (/insufficient credits/i.test(completeError.message || "")) throw insufficientCreditsError("Недостаточно кредитов для перегенерации");
      if (/claim mismatch/i.test(completeError.message || "")) throw httpError(409, "Перегенерация уже обрабатывается другим запросом");
      throw completeError;
    }

    if (pin.image_url && pin.image_url !== storedUrl) {
      await deletePinImageIfUnreferenced(pin.image_url).catch((cleanupError) => {
        logError("index.event_010");
      });
    }
    return res.json(completed.pin);
  } catch (e) {
    if (requestStarted && claimToken && idempotencyKey) {
      let providerFailureRecorded = false;
      if (e && e.providerStatus === "failed" && e.providerTaskId) {
        try {
          let reconciledRefund = e.providerRefunded == null ? null : e.providerRefunded;
          if (reconciledRefund == null) {
            const { data: savedOutcome, error: savedOutcomeError } = await supabase
              .from("pin_regeneration_requests")
              .select("provider_refunded")
              .eq("user_id", String(req.userId))
              .eq("idempotency_key", idempotencyKey)
              .single();
            if (savedOutcomeError) throw savedOutcomeError;
            if (savedOutcome && savedOutcome.provider_refunded != null) {
              reconciledRefund = savedOutcome.provider_refunded;
            }
          }
          const { error: outcomeError } = await supabase.rpc("record_pin_regeneration_provider_outcome", {
            p_user_id: String(req.userId),
            p_idempotency_key: idempotencyKey,
            p_claim_token: claimToken,
            p_provider_task_id: e.providerTaskId,
            p_provider_status: "failed",
            p_provider_price: e.providerPrice == null ? null : e.providerPrice,
            p_provider_refunded: reconciledRefund,
            p_provider_error_code: e.providerErrorCode == null ? null : e.providerErrorCode,
            p_provider_error_title: e.providerErrorTitle || null,
          });
          if (outcomeError) throw outcomeError;
          providerFailureRecorded = true;
        } catch (journalError) {
          logError("index.event_009");
        }
      }
      await settleQuery(supabase.rpc("update_pin_regeneration_request", {
        p_user_id: String(req.userId), p_idempotency_key: idempotencyKey, p_claim_token: claimToken,
        // Only a provider-confirmed failure with a persisted terminal outcome
        // may become failed. Otherwise retain unknown and block a fresh task.
        p_status: providerFailureRecorded ? "failed" : "unknown",
        p_error_code: providerFailureRecorded ? "provider_generation_failed" :
          (e && e.status === 402 ? "insufficient_balance" : "regeneration_outcome_unknown"),
      }), () => logError("index.event_008"));
    }
    handleError(res, e);
  }
});


/**
 * Manual-review queue is durable user data, separate from the autonomous
 * Pinterest publication scheduler. Each row is owner-scoped and contains only
 * the fields needed to render/review a saved pin.
 */
app.get("/review-queue", requireAuth, async (req, res) => {
  try {
    const userId = String(req.userId);
    // Use the shared bounded pager so a very large review backlog cannot
    // trigger an unbounded query loop or memory growth. Overflow is explicit.
    const rows = await fetchAllPages((from, to) => supabase
      .from("pin_review_queue")
      .select("id,pin_id,payload,created_at,updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to));
    const pinIds = [...new Set(rows
      .map((row) => row.pin_id || (row.payload && row.payload.pinId))
      .filter(Boolean)
      .map(String))];
    const pinsById = new Map();
    const scheduledPinIds = new Set();
    if (pinIds.length) {
      const pinIdChunks = Array.from({ length: Math.ceil(pinIds.length / 200) }, (_, index) =>
        pinIds.slice(index * 200, (index + 1) * 200)
      );
      const pinResults = [];
      for (let offset = 0; offset < pinIdChunks.length; offset += 5) {
        const batchResults = await Promise.all(pinIdChunks.slice(offset, offset + 5).map((ids) =>
          supabase
            .from("pins")
            .select("id,status,boards(id,projects(user_id))")
            .in("id", ids)
        ));
        pinResults.push(...batchResults);
      }
      for (const result of pinResults) {
        for (const pin of readArrayQueryResult(result)) pinsById.set(String(pin.id), pin);
      }

      // A queue row can survive if scheduling succeeded but the follow-up
      // queue deletion failed. Reconcile against persisted schedules so a
      // refresh cannot offer the same pin for approval a second time.
      const scheduleResults = [];
      for (let offset = 0; offset < pinIdChunks.length; offset += 5) {
        const batchResults = await Promise.all(pinIdChunks.slice(offset, offset + 5).map((ids) =>
          supabase
            .from("pin_schedules")
            .select("pin_id")
            .eq("user_id", userId)
            .in("pin_id", ids)
            .in("status", ["scheduled", "publishing", "published", "unknown"])
        ));
        scheduleResults.push(...batchResults);
      }
      for (const result of scheduleResults) {
        for (const schedule of readArrayQueryResult(result)) scheduledPinIds.add(String(schedule.pin_id));
      }
    }

    const { reconcileReviewQueueRows } = require("./reviewQueueReconciliation");
    const reconciled = reconcileReviewQueueRows(rows, pinsById, userId, scheduledPinIds);
    if (reconciled.staleIds.length) {
      // Keep cleanup filters bounded as well: a large stale backlog can
      // otherwise exceed PostgREST URL/request limits during reconciliation.
      for (let offset = 0; offset < reconciled.staleIds.length; offset += 200) {
        const staleIdChunk = reconciled.staleIds.slice(offset, offset + 200);
        const { error: cleanupError } = await supabase
          .from("pin_review_queue")
          .delete()
          .eq("user_id", userId)
          .in("id", staleIdChunk);
        if (cleanupError) throw cleanupError;
      }
    }
    res.json(reconciled.active);
  } catch (e) {
    handleError(res, e);
  }
});

app.put("/review-queue/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const payload = req.body && req.body.pin;
    const { normalizeReviewQueuePin } = require("./reviewQueueValidation");
    const safePayload = normalizeReviewQueuePin(id, payload);
    // Queue entries may reference only pins owned by the authenticated user.
    // Demo entries without pinId remain supported for the existing preview UI.
    if (safePayload.pinId) await getPinWithOwnerCheck(safePayload.pinId, req.userId);
    const { data, error } = await supabase
      .from("pin_review_queue")
      .upsert({
        id,
        user_id: String(req.userId),
        pin_id: safePayload.pinId || null,
        payload: safePayload,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,id" })
      .select("id,pin_id,payload,created_at,updated_at")
      .single();
    if (error) throw error;
    res.json({ ...data.payload, id: data.id, pinId: data.pin_id || undefined });
  } catch (e) {
    handleError(res, e);
  }
});

app.delete("/review-queue/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id || id.length > 100) throw httpError(422, "Некорректный ID записи");
    const { error } = await supabase
      .from("pin_review_queue")
      .delete()
      .eq("id", id)
      .eq("user_id", String(req.userId));
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    handleError(res, e);
  }
});

// --- Генерация пинов ---

// Создание доски в постоянной базе данных. project_id проверяется по владельцу.
app.post("/boards", requireAuth, async (req, res) => {
  try {
    const projectId = optionalString(req.body && req.body.project_id, { max: 64 });
    const title = optionalString(req.body && req.body.title, { max: 100 });
    const description = optionalString(req.body && req.body.description, { max: 500 }) || "";
    const category = optionalString(req.body && req.body.category, { max: 120 }) || null;
    const requestId = optionalString(req.body && req.body.create_request_id, { max: 36 });

    if (!projectId) throw httpError(422, "Укажите project_id");
    if (!title) throw validationError("board_name_required", "Название доски обязательно");
    if (requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      throw httpError(422, "Некорректный ключ создания доски");
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", req.userId)
      .single();

    if (projectError && !isMissingRow(projectError)) {
      logError("index.event_027", projectError);
      throw httpError(503, "Сервис проектов временно недоступен — попробуйте позже");
    }
    if (!project) throw notFoundError("project_not_found", "Проект не найден");

    // Legacy clients may omit the key. New clients reuse one UUID for every
    // retry of the same logical create operation. The database unique index
    // makes concurrent retries converge on one row.
    if (requestId) {
      const fingerprintPayload = { project_id: project.id, title, description };
      // Preserve the original fingerprint for retries from clients that predate category support.
      if (category !== null) fingerprintPayload.category = category;
      const fingerprint = crypto.createHash("sha256")
        .update(JSON.stringify(fingerprintPayload))
        .digest("hex");
      const { error: insertError } = await supabase
        .from("boards")
        .upsert({
          project_id: project.id,
          title,
          description,
          category,
          status: "new",
          create_request_id: requestId,
          create_request_fingerprint: fingerprint,
        }, {
          onConflict: "project_id,create_request_id",
          ignoreDuplicates: true,
        });

      if (insertError) throw insertError;

      const { data, error } = await supabase
        .from("boards")
        .select("*")
        .eq("project_id", project.id)
        .eq("create_request_id", requestId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Не удалось подтвердить создание доски");
      if (data.create_request_fingerprint !== fingerprint) {
        throw httpError(409, "Этот запрос уже использован для другой доски. Начните создание заново.");
      }
      const { create_request_fingerprint: _fingerprint, ...publicBoard } = data;
      return res.status(200).json(serializeBoardForClient(publicBoard));
    }

    const { data, error } = await supabase
      .from("boards")
      .insert({ project_id: project.id, title, description, category, status: "new" })
      .select("*")
      .single();

    if (error) throw error;
    res.status(201).json(serializeBoardForClient(data));
  } catch (e) {
    handleError(res, e);
  }
});

// Обновление названия/описания доски с обязательной проверкой владельца.
app.patch("/boards/:id", requireAuth, async (req, res) => {
  try {
    const board = await getBoardWithOwnerCheck(req.params.id, req.userId);
    const patch = buildBoardPatch(req.body);

    const { data, error } = await supabase
      .from("boards")
      .update(patch)
      .eq("id", req.params.id)
      .eq("project_id", board.project_id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) throw notFoundError("board_not_found", "Доска больше не существует");
    res.json(serializeBoardForClient(data));
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/boards", requireAuth, async (req, res) => {
  try {
    const projects = await fetchAllPages((from, to) => supabase
      .from("projects")
      .select("id")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to));
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length === 0) return res.json([]);

    // Keep the PostgREST IN clause and response size bounded while fetching
    // every board, rather than silently truncating at the server row cap.
    const boards = [];
    for (let offset = 0; offset < projectIds.length; offset += 100) {
      const projectIdBatch = projectIds.slice(offset, offset + 100);
      const batch = await fetchAllPages((from, to) => supabase
        .from("boards")
        .select("*, projects(niche, website_url)")
        .in("project_id", projectIdBatch)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to), { maxRows: Math.max(1, 10000 - boards.length) });
      boards.push(...batch);
      if (boards.length > 10000) {
        throw httpError(413, "Слишком много досок для одного списка. Уменьшите объём данных.");
      }
    }

    // Each project-ID batch is ordered independently; restore the global
    // newest-first ordering before returning the combined result.
    boards.sort((a, b) =>
      String(b.created_at || "").localeCompare(String(a.created_at || "")) ||
      String(b.id || "").localeCompare(String(a.id || ""))
    );

    // Fetch exact counts without downloading pin rows. Concurrent requests
    // are bounded to small batches to avoid overloading PostgREST.
    const pinCounts = new Map();
    for (let offset = 0; offset < boards.length; offset += 5) {
      const batch = boards.slice(offset, offset + 5);
      const counts = await Promise.all(batch.map(async (board) => {
        const { count, error: countError } = await supabase
          .from("pins")
          .select("id", { count: "exact", head: true })
          .eq("board_id", board.id);
        if (countError) throw countError;
        return [board.id, Number.isInteger(count) && count >= 0 ? count : 0];
      }));
      for (const [boardId, count] of counts) pinCounts.set(boardId, count);
    }

    res.json(boards.map((board) => ({
      ...serializeBoardForClient(board),
      pin_count: pinCounts.get(board.id) || 0,
    })));
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/boards/:id", requireAuth, async (req, res) => {
  try {
    const board = await getBoardWithOwnerCheck(req.params.id, req.userId);
    res.json(serializeBoardForClient(board));
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/boards/:id/pins", requireAuth, async (req, res) => {
  try {
    await getBoardWithOwnerCheck(req.params.id, req.userId);
    // Bound the full-board response just like other collection endpoints:
    // oversized boards fail explicitly instead of growing memory without limit.
    const pins = await fetchAllPages((from, to) => supabase
      .from("pins")
      .select("*")
      .eq("board_id", req.params.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to));
    res.json(pins);
  } catch (e) {
    handleError(res, e);
  }
});

// Read-only recovery endpoint: exposes only the authenticated user's request status
// and completed pin fields. Provider prompts, task IDs, raw errors and tokens stay private.
app.get("/generation/requests/:key", requireAuth, async (req, res) => {
  try {
    const idempotencyKey = String(req.params.key || "");
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw httpError(422, "Некорректный ключ восстановления генерации");
    }
    const { data: request, error } = await supabase
      .from("pin_generation_requests")
      .select("id, board_id, status, pins, replay_expired_at, created_at, updated_at")
      .eq("user_id", String(req.userId))
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw error;
    if (!request) throw notFoundError("generation_request_not_found", "Запрос генерации не найден");
    if (request.replay_expired_at) {
      return res.status(410).json({
        error: "Срок хранения результата генерации истёк. Используйте новый ключ идемпотентности для новой операции.",
        code: "idempotency_result_expired",
      });
    }

    res.json(serializeGenerationRecovery(request));
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/boards/:id/pins/generate", requireAuth, aiLimiter, requireTariff(["standard", "pro", "agency", "start"]), async (req, res) => {
  let idempotencyKey = req.get("Idempotency-Key");
  let generationRequestStarted = false;
  let providerGenerationStarted = false;
  let generationClaimToken = null;
  try {
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw httpError(422, "Для генерации требуется корректный Idempotency-Key");
    }
    const board = await getBoardWithOwnerCheck(req.params.id, req.userId);
    const model = validateEnum(req.body && req.body.model, Object.keys(MODEL_PRICES), "flux-schnell", "Модель");
    const count = validateInt(req.body && req.body.count, { min: 1, max: 10, def: 6, name: "Количество" });
    const aspectRatio = validateEnum(
      req.body && req.body.aspect_ratio,
      [...ASPECT_RATIOS, "mixed"],
      "mixed",
      "Формат"
    );
    let mixedRatios = req.body && req.body.mixed_ratios;
    if (mixedRatios !== undefined && !Array.isArray(mixedRatios)) {
      throw httpError(422, "mixed_ratios должен быть массивом");
    }
    if (Array.isArray(mixedRatios)) {
      mixedRatios = mixedRatios.filter((r) => ASPECT_RATIOS.includes(r)).slice(0, 10);
    }

    const topic = optionalString(req.body && req.body.topic, { max: 500 }) || board.title;
    const tone = optionalString(req.body && req.body.tone, { max: 80 }) || board.projects.tone || "нейтральный";
    const contentLanguage = validateEnum(
      req.body && req.body.content_language,
      PIN_CONTENT_LANGUAGES,
      board.projects.language || "en",
      "Язык"
    );
    const requestFingerprint = crypto.createHash("sha256").update(JSON.stringify({
      boardId: board.id, model, count, aspectRatio, mixedRatios: mixedRatios || [],
      topic, tone, contentLanguage,
    })).digest("hex");
    const { data: requestState, error: requestError } = await supabase.rpc("begin_pin_generation_request", {
      p_user_id: String(req.userId),
      p_board_id: board.id,
      p_idempotency_key: idempotencyKey,
      p_fingerprint: requestFingerprint,
    });
    if (requestError) throw requestError;
    if (requestState.status === "expired") {
      return res.status(410).json({
        error: "Срок хранения результата генерации истёк. Используйте новый ключ идемпотентности для новой операции.",
        code: "idempotency_result_expired",
      });
    }
    if (requestState.status === "completed") return res.status(200).json(requestState.pins || []);
    if (requestState.status === "processing") {
      res.set("Retry-After", "5");
      return sendError(res, 409, "Такая генерация уже выполняется. Повторите запрос с тем же ключом через несколько секунд.", "generation_in_progress", { retryAfterSeconds: 5 });
    }
    if (requestState.status === "unknown") {
      return sendError(res, 409, "Результат предыдущей генерации не подтверждён. Повторный запуск без сохранённого журнала заблокирован.", "generation_outcome_unknown");
    }
    if (requestState.status === "failed") {
      return sendError(res, 409, "Предыдущий запрос завершился до подтверждённого результата. Для новой попытки создайте новый ключ идемпотентности.", "generation_request_failed");
    }
    if (requestState.status !== "started" && requestState.status !== "resume") {
      throw httpError(500, "Неизвестное состояние запроса генерации");
    }
    generationClaimToken = requestState.claim_token;
    if (typeof generationClaimToken !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generationClaimToken)) {
      throw httpError(500, "Не удалось безопасно получить право на генерацию");
    }
    generationRequestStarted = true;
    if (requestState.status === "resume") {
      // Existing provider tasks may already have been charged; keep failures fenced.
      providerGenerationStarted = true;
    }

    // A resumed journal may already represent billable provider work. Do not
    // reject recovery using a fresh estimate; the atomic completion RPC checks
    // the actual final charge against the current balance before saving pins.
    const estimatedCost = calculateGenerationReservation(MODEL_PRICES[model] || 15, count, MARKUP);
    if (requestState.status !== "resume") {
      const balance = await getBalance(req.userId);
      if (balance < estimatedCost) {
        throw insufficientCreditsError("Недостаточно кредитов для этой генерации");
      }
    }
    // Create the initial estimate reservation only once. A resumed request may
    // already hold the exact quote-based (or actual-settlement) amount, so
    // replaying reserve with the original estimate would incorrectly conflict.
    // ensureTaskQuotes below validates/resizes that existing reservation before
    // any new image submission; a missing/inactive reservation fails closed.
    if (requestState.status !== "resume") {
      const { error: reservationError } = await supabase.rpc("reserve_pin_generation_credits", {
        p_user_id: String(req.userId),
        p_idempotency_key: idempotencyKey,
        p_amount: estimatedCost,
      });
      if (reservationError) {
        if (/insufficient available credits/i.test(reservationError.message || "")) {
          throw insufficientCreditsError("Недостаточно доступных кредитов: часть баланса уже зарезервирована для других генераций.");
        }
        throw reservationError;
      }
    }

    let allowPreparedTaskSubmission = true;
    const pinsData = await generatePins(board, board.projects, model, count, aspectRatio, mixedRatios, {
      topic,
      tone,
      language: contentLanguage,
      onTextProviderSubmission: () => {
        providerGenerationStarted = true;
      },
      onTextProviderCompleted: () => {
        // The text request has a definitive response. Only later image-task
        // submissions can make the overall generation outcome uncertain.
        providerGenerationStarted = false;
      },
      onProviderSubmission: () => {
        providerGenerationStarted = true;
      },
      loadPlan: requestState.status === "resume" ? async () => {
        const { data, error } = await supabase.rpc("get_pin_generation_plan", {
          p_user_id: String(req.userId),
          p_idempotency_key: idempotencyKey,
        });
        if (error) {
          const journalError = new Error("Не удалось загрузить сохранённый план генерации");
          journalError.journalError = true;
          journalError.cause = error;
          throw journalError;
        }
        const savedTasks = Array.isArray(data) ? data : [];
        const notYetConfirmedTasks = savedTasks.filter(
          (task) => task.status === "prepared"
        );
        if (notYetConfirmedTasks.length > 0) {
          allowPreparedTaskSubmission = true;
        }
        return data;
      } : undefined,
      allowPreparedTaskSubmission: () => allowPreparedTaskSubmission,
      recordTextUsage: async (result) => {
        const { error } = await supabase.rpc("record_pin_generation_text_usage", {
          p_user_id: String(req.userId),
          p_idempotency_key: idempotencyKey,
          p_claim_token: generationClaimToken,
          p_provider_request_id: result.requestId || null,
          p_provider_model: result.model || "unknown",
          p_usage: result.usage || {},
          p_total_cost_rub: result.costCurrency === "RUB" && Number.isFinite(result.usage?.totalCost) && result.usage.totalCost >= 0 ? result.usage.totalCost : null,
        });
        if (error) {
          const journalError = new Error("Не удалось сохранить стоимость текстовой генерации с некорректным планом");
          journalError.journalError = true;
          journalError.cause = error;
          throw journalError;
        }
      },
      persistTextPlan: async (result, tasks) => {
        const { data, error } = await supabase.rpc("record_pin_generation_text_plan", {
          p_user_id: String(req.userId),
          p_idempotency_key: idempotencyKey,
          p_claim_token: generationClaimToken,
          p_provider_request_id: result.requestId || null,
          p_provider_model: result.model || "unknown",
          p_usage: result.usage || {},
          p_total_cost_rub: result.costCurrency === "RUB" && Number.isFinite(result.usage?.totalCost) && result.usage.totalCost >= 0 ? result.usage.totalCost : null,
          p_tasks: tasks,
        });
        if (error) {
          const journalError = new Error("Не удалось атомарно сохранить стоимость и план текстовой генерации");
          journalError.journalError = true;
          journalError.cause = error;
          throw journalError;
        }
        return data;
      },
      ensureTaskQuotes: async (tasks) => {
        const billableTasks = tasks.filter((task) => task.status !== "failed");
        for (const task of billableTasks) {
          if (task.provider_quote_price != null) {
            if (task.provider_quote_currency !== "RUB" ||
                task.provider_quote_model !== (task.model || model) ||
                task.provider_quote_aspect_ratio !== task.aspect_ratio ||
                !Number.isFinite(Number(task.provider_quote_price)) ||
                Number(task.provider_quote_price) <= 0) {
              throw httpError(502, "Сохранённая котировка генерации не соответствует задаче.");
            }
          }
        }

        // Quote a small bounded batch concurrently: ten sequential 30-second
        // provider timeouts could exceed the HTTP request lifetime.
        for (let offset = 0; offset < billableTasks.length; offset += 3) {
          const batch = billableTasks.slice(offset, offset + 3)
            .filter((task) => task.provider_quote_price == null);
          const quotes = await Promise.all(batch.map(async (task) => ({
            task,
            quote: await quoteImageTask(task.prompt, task.model || model, task.aspect_ratio),
          })));
          for (const { task, quote } of quotes) {
            const { error } = await supabase.rpc("record_pin_generation_task_quote", {
              p_user_id: String(req.userId),
              p_idempotency_key: idempotencyKey,
              p_claim_token: generationClaimToken,
              p_task_index: task.task_index,
              p_quote_price: quote.price,
              p_quote_currency: quote.currency,
              p_quote_model: quote.model,
              p_quote_aspect_ratio: quote.params.aspect_ratio,
            });
            if (error) {
              const journalError = new Error("Не удалось сохранить котировку задачи генерации");
              journalError.journalError = true;
              journalError.cause = error;
              throw journalError;
            }
            task.provider_quote_price = quote.price;
            task.provider_quote_currency = quote.currency;
            task.provider_quote_model = quote.model;
            task.provider_quote_aspect_ratio = quote.params.aspect_ratio;
          }
        }

        if (billableTasks.length > 0) {
          const quotedPricing = calculateQuotedGenerationPricing(
            billableTasks.map((task) => ({
              price: Number(task.provider_quote_price),
              currency: task.provider_quote_currency,
            })),
            MARKUP
          );
          const { error } = await supabase.rpc("resize_pin_generation_credit_reservation", {
            p_user_id: String(req.userId),
            p_idempotency_key: idempotencyKey,
            p_claim_token: generationClaimToken,
            p_amount: quotedPricing.totalUserCredits,
          });
          if (error) {
            if (/insufficient available credits/i.test(error.message || "")) {
              throw insufficientCreditsError("Недостаточно доступных кредитов для подтверждённой стоимости генерации.");
            }
            throw error;
          }
        }
        return tasks;
      },
      recordProviderOutcome: async (taskIndex, outcome, status) => {
        // A trusted reconciliation can enrich provider_refunded after the
        // original failure was journaled. Reuse that durable fact on retries.
        let reconciledRefund = status === "failed" ? outcome.refunded : null;
        if (status === "failed" && reconciledRefund == null) {
          const { data: savedPlan, error: savedPlanError } = await supabase.rpc("get_pin_generation_plan", {
            p_user_id: String(req.userId),
            p_idempotency_key: idempotencyKey,
          });
          if (savedPlanError) throw savedPlanError;
          const savedTask = Array.isArray(savedPlan)
            ? savedPlan.find((task) => Number(task.task_index) === Number(taskIndex))
            : null;
          if (savedTask && savedTask.provider_refunded != null) {
            reconciledRefund = savedTask.provider_refunded;
          }
        }
        const { error } = await supabase.rpc("record_pin_generation_provider_outcome", {
          p_user_id: String(req.userId),
          p_idempotency_key: idempotencyKey,
          p_claim_token: generationClaimToken,
          p_task_index: taskIndex,
          p_provider_task_id: outcome.taskId,
          p_provider_status: status,
          p_provider_price: outcome.price == null ? null : outcome.price,
          p_provider_refunded: reconciledRefund,
          p_provider_error_code: status === "failed" && outcome.errorCode != null
            ? outcome.errorCode : null,
          p_provider_error_title: status === "failed" ? outcome.errorTitle || null : null,
          p_provider_result_url: status === "succeeded" ? outcome.resultUrl : null,
        });
        if (error) {
          const journalError = new Error("Не удалось сохранить итог задачи у провайдера");
          journalError.journalError = true;
          journalError.cause = error;
          throw journalError;
        }
      },
      updateTask: async (taskIndex, status, details = {}) => {
        const { error } = await supabase.rpc("update_pin_generation_task", {
          p_user_id: String(req.userId),
          p_idempotency_key: idempotencyKey,
          p_claim_token: generationClaimToken,
          p_task_index: taskIndex,
          p_status: status,
          p_provider_task_id: details.providerTaskId || null,
          p_provider_result_url: details.providerResultUrl || null,
          p_storage_url: details.storageUrl || null,
          p_provider_price: details.providerPrice == null ? null : details.providerPrice,
          p_error_code: details.errorCode || null,
        });
        if (error) {
          const journalError = new Error("Не удалось обновить журнал генерации");
          journalError.journalError = true;
          journalError.cause = error;
          throw journalError;
        }
      },
    });

    if ((pinsData.pendingTasks && pinsData.pendingTasks.length) ||
        (pinsData.unknownTasks && pinsData.unknownTasks.length)) {
      throw httpError(409, "Часть задач генерации ещё не подтверждена. Запрос заблокирован до сверки результатов.");
    }

    // B8: вставляем только пины с готовой картинкой и известной ценой
    const okPins = pinsData.filter((p) => p && p.image_url && p.credits_cost != null);
    if (okPins.length === 0) {
      if (pinsData.failedTasks && pinsData.failedTasks.length === pinsData.plannedTaskCount &&
          pinsData.plannedTaskCount > 0) {
        // Every provider task explicitly ended in failed; this key has a known outcome.
        providerGenerationStarted = false;
      }
      throw httpError(502, "Не удалось сгенерировать ни одного изображения. Кредиты не списаны — попробуйте ещё раз.");
    }

    const markedUpPins = okPins.map((p) => ({
      ...p,
      credits_cost: ceilCredits(p.credits_cost * MARKUP),
    }));
    const totalCharge = markedUpPins.reduce((sum, p) => sum + p.credits_cost, 0);

    // Provider prices are authoritative. Resize the reservation to the exact
    // marked-up settlement before the atomic pin insert/debit RPC; if the
    // provider price drifted upward, a top-up and same-key recovery can settle
    // the already-journaled images without generating them again.
    if (totalCharge > 0) {
      const { error: finalResizeError } = await supabase.rpc("resize_pin_generation_credit_reservation", {
        p_user_id: String(req.userId),
        p_idempotency_key: idempotencyKey,
        p_claim_token: generationClaimToken,
        p_amount: totalCharge,
      });
      if (finalResizeError) {
        if (/insufficient available credits/i.test(finalResizeError.message || "")) {
          throw insufficientCreditsError("Фактическая стоимость генерации выше резерва. Пополните баланс и повторите этот же запрос.");
        }
        throw finalResizeError;
      }
    }

    const { data: savedResult, error: saveError } = await supabase.rpc("complete_pin_generation_request", {
      p_user_id: String(req.userId),
      p_board_id: board.id,
      p_idempotency_key: idempotencyKey,
      p_claim_token: generationClaimToken,
      p_pins: markedUpPins.map((p) => ({
        image_url: p.image_url,
        title: p.title,
        description: p.description || "",
        model_used: p.model_used,
        aspect_ratio: p.aspect_ratio,
        credits_cost: p.credits_cost,
      })),
      p_amount: totalCharge,
    });

    if (saveError) {
      if (/insufficient credits/i.test(saveError.message || "")) {
        throw insufficientCreditsError("Баланс изменился во время генерации. Недостаточно кредитов для сохранения результата.");
      }
      throw saveError;
    }

    const inserted = savedResult && savedResult.pins;
    if (!Array.isArray(inserted) || inserted.length === 0) {
      throw generationSaveFailedError();
    }
    generationRequestStarted = false;
    res.status(201).json(inserted);
  } catch (e) {
    if (generationRequestStarted && idempotencyKey) {
      try {
        await supabase.rpc("fail_pin_generation_request", {
          p_user_id: String(req.userId),
          p_idempotency_key: idempotencyKey,
          p_claim_token: generationClaimToken,
          p_error_code: e && e.httpStatus === 402 ? "insufficient_credits" : "generation_failed",
          p_outcome_unknown: providerGenerationStarted,
        });
      } catch (markError) {
        logError("index.event_007");
      }
    }
    const publicMessage = e && e.code === "GPTUNNEL_TEXT_COST_MISSING"
      ? "GPTunnel временно не подтвердил стоимость текстовой генерации. Создание изображений остановлено; попробуйте позже."
      : undefined;
    // The database has already returned the reservation when the provider was never asked for an
    // image; without this the customer cannot tell a free failure from a charged one.
    handleError(res, markGenerationFailure(e, { providerStarted: providerGenerationStarted }), publicMessage);
  }
});

// --- Постоянное расписание публикаций ---
// Запись в очереди не считается опубликованной: статус published появится
// только после успешного ответа Pinterest от отдельного worker.
app.get("/schedule", requireAuth, async (req, res) => {
  try {
    // Use the shared bounded pager: every schedule is loaded up to the
    // explicit 10,000-row ceiling, and larger accounts receive HTTP 413
    // instead of an unbounded loop and memory growth.
    const rows = await fetchAllPages((from, to) => supabase
      .from("pin_schedules")
      .select("*, pins(id, board_id, title, description, image_url, status, boards(id, title))")
      .eq("user_id", String(req.userId))
      .order("scheduled_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to));

    const failedRows = rows.filter((row) => row.status === "failed");
    if (!failedRows.length) {
      return res.json(rows.map((row) => sanitizeScheduleForClient({ ...row, retryable: false, retry_reason: null, failure_reason: null })));
    }

    const pinIds = [...new Set(failedRows.map((row) => String(row.pin_id)))];
    const accountIds = [...new Set(failedRows.map((row) => row.pinterest_account_id).filter(Boolean).map(String))];
    // Keep .in() filters bounded as a user's schedule grows; large PostgREST
    // query strings can otherwise fail even though the schedule itself loaded.
    const chunksOf = (values, size = 200) =>
      Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
        values.slice(index * size, (index + 1) * size)
      );
    const [attemptsResults, publicationsResults, accountsResults] = await Promise.all([
      Promise.all(chunksOf(pinIds).map((ids) =>
        supabase.from("pinterest_publish_attempts")
          .select("user_id, pin_id, pinterest_account_id, pinterest_board_id, status, retry_safe")
          .eq("user_id", String(req.userId))
          .in("pin_id", ids)
      )),
      Promise.all(chunksOf(pinIds).map((ids) =>
        supabase.from("pinterest_publications")
          .select("user_id, pin_id, pinterest_account_id")
          .eq("user_id", String(req.userId))
          .in("pin_id", ids)
      )),
      Promise.all(chunksOf(accountIds).map((ids) =>
        supabase.from("pinterest_accounts")
          .select("id")
          .eq("user_id", String(req.userId))
          .is("disconnected_at", null)
          .not("access_token", "is", null)
          .in("id", ids)
      )),
    ]);
    const metadataResults = [...attemptsResults, ...publicationsResults, ...accountsResults];
    const metadataUnavailableRows = () => rows.map((row) => row.status === "failed"
      ? sanitizeScheduleForClient({ ...row, retryable: false, retry_reason: "metadata_unavailable", failure_reason: getScheduleFailureReason(row) })
      : sanitizeScheduleForClient({ ...row, retryable: false, retry_reason: null, failure_reason: null }));
    const metadataError = metadataResults.find((result) => result && result.error)?.error;
    if (metadataError) {
      logError("index.event_006");
      return res.json(metadataUnavailableRows());
    }

    let attempts;
    let publications;
    let activeAccountIds;
    try {
      attempts = attemptsResults.flatMap(readArrayQueryResult);
      publications = publicationsResults.flatMap(readArrayQueryResult);
      activeAccountIds = new Set(accountsResults.flatMap(readArrayQueryResult).map((account) => String(account.id)));
    } catch {
      // Missing/malformed retry metadata is not evidence that a Pinterest publish
      // was never accepted. Keep the schedule visible but disable retry actions.
      logError("index.event_006");
      return res.json(metadataUnavailableRows());
    }
    // Index retry metadata once. Re-scanning every attempt/publication/schedule
    // for every failed row turns a large calendar into quadratic work.
    const identityKey = (...parts) => JSON.stringify(parts.map((part) => String(part || "")));
    const attemptsByPinAndAccount = new Map();
    const attemptsByExactDestination = new Map();
    for (const attempt of attempts) {
      const baseKey = identityKey(attempt.user_id, attempt.pin_id, attempt.pinterest_account_id);
      if (!attemptsByPinAndAccount.has(baseKey)) attemptsByPinAndAccount.set(baseKey, attempt);
      const destinationKey = identityKey(attempt.user_id, attempt.pin_id, attempt.pinterest_account_id, attempt.pinterest_board_id);
      if (!attemptsByExactDestination.has(destinationKey)) attemptsByExactDestination.set(destinationKey, attempt);
    }
    const publicationKeys = new Set(publications.map((item) =>
      identityKey(item.user_id, item.pin_id, item.pinterest_account_id)
    ));
    const activeScheduleStatuses = new Set(["scheduled", "publishing", "published", "unknown"]);
    const activeScheduleKeys = new Set(rows
      .filter((row) => activeScheduleStatuses.has(row.status))
      .map((row) => identityKey(row.pin_id, row.pinterest_account_id)));
    const enriched = rows.map((row) => {
      if (row.status !== "failed") return sanitizeScheduleForClient({ ...row, retryable: false, retry_reason: null, failure_reason: null });
      const accountId = row.pinterest_account_id ? String(row.pinterest_account_id) : null;
      const baseKey = identityKey(req.userId, row.pin_id, accountId);
      const destinationKey = identityKey(req.userId, row.pin_id, accountId, row.pinterest_board_id);
      const attempt = attemptsByExactDestination.get(destinationKey) || attemptsByPinAndAccount.get(baseKey) || null;
      const hasPublication = publicationKeys.has(baseKey);
      const hasActiveDuplicate = activeScheduleKeys.has(identityKey(row.pin_id, accountId));
      const retry = getScheduleRetryability(
        row,
        attempt,
        hasPublication,
        !!accountId && activeAccountIds.has(accountId),
        hasActiveDuplicate
      );
      return sanitizeScheduleForClient({ ...row, retryable: retry.retryable, retry_reason: retry.reason, failure_reason: getScheduleFailureReason(row) });
    });
    res.json(enriched);
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/schedule/:id/reconcile-account", requireAuth, pinterestScheduleLimiter, async (req, res) => {
  try {
    const { data: schedule, error: scheduleError } = await supabase
      .from("pin_schedules")
      .select("id, user_id, pin_id, pinterest_account_id, pinterest_board_id, status")
      .eq("id", req.params.id)
      .eq("user_id", String(req.userId))
      .maybeSingle();
    if (scheduleError) throw scheduleError;
    if (!schedule) throw notFoundError("schedule_not_found", "Расписание не найдено");
    if (schedule.pinterest_account_id) {
      throw httpError(409, "Для этого расписания Pinterest-аккаунт уже назначен");
    }
    if (!schedule.pinterest_board_id) {
      throw httpError(422, "У старого расписания не сохранена Pinterest-доска. Создайте расписание заново.");
    }

    const pinterest = require("./pinterest");
    const requestedAccountId = req.body && req.body.pinterest_account_id
      ? String(req.body.pinterest_account_id)
      : null;
    const resolution = classifyLegacyScheduleAccount(
      await pinterest.getAccounts(req.userId),
      requestedAccountId
    );
    if (resolution.status === "no_account") {
      throw conflictError("pinterest_not_connected", "Сначала подключите Pinterest-аккаунт.");
    }
    if (resolution.status === "selection_required") {
      throw httpError(422, "У вас несколько Pinterest-аккаунтов. Выберите, в какой аккаунт восстановить расписание.");
    }
    if (resolution.status === "invalid_selection") {
      throw notFoundError("pinterest_account_not_found", "Выбранный Pinterest-аккаунт не найден или отключён.");
    }

    // The saved remote board must be readable through the exact selected identity.
    await pinterest.verifyPinterestBoard(
      req.userId,
      schedule.pinterest_board_id,
      resolution.account.id
    );

    const { data: reconciled, error: reconcileError } = await supabase.rpc(
      "reconcile_legacy_pinterest_schedule_account",
      {
        p_user_id: String(req.userId),
        p_schedule_id: schedule.id,
        p_pinterest_account_id: resolution.account.id,
      }
    );
    if (reconcileError) throw reconcileError;
    if (!reconciled || reconciled.ok !== true) {
      const reasons = {
        account_already_assigned: [409, "Для расписания уже назначен аккаунт."],
        schedule_not_reconcilable: [409, "Это расписание уже обрабатывается или завершено; автоматически восстановить его нельзя."],
        board_missing: [422, "У расписания не указана доска Pinterest."],
        pin_unavailable: [404, "Исходный пин больше недоступен."],
        pin_not_approved: [409, "Сначала одобрите исходный пин, затем восстановите расписание."],
        account_unavailable: [409, "Pinterest-аккаунт отключён. Подключите его заново."],
        publication_history_exists: [409, "Для этого пина уже есть история публикации. Нужна ручная сверка, автоматическое назначение заблокировано."],
        active_schedule_exists: [409, "Для этого пина уже есть активное расписание в выбранном аккаунте."],
        schedule_changed: [409, "Расписание изменилось параллельно. Обновите календарь и повторите проверку."],
        schedule_not_found: [404, "Расписание не найдено."],
      };
      const [status, message] = reasons[reconciled && reconciled.reason] || [409, "Не удалось безопасно восстановить расписание."];
      throw httpError(status, message);
    }

    const { data: updated, error: readError } = await supabase
      .from("pin_schedules")
      .select("*, pins(id, board_id, title, description, image_url, boards(id, title))")
      .eq("id", schedule.id)
      .eq("user_id", String(req.userId))
      .single();
    if (readError) throw readError;

    // Match GET /schedule: a reconciled failed row must expose the same safe
    // retry decision as the calendar list, otherwise the UI can incorrectly
    // disable a retry immediately after successful account recovery.
    const accountId = updated.pinterest_account_id ? String(updated.pinterest_account_id) : null;
    if (updated.status !== "failed") {
      return res.json(sanitizeScheduleForClient({
        ...updated,
        retryable: false,
        retry_reason: null,
        failure_reason: null,
      }));
    }

    const [attemptsResult, publicationsResult, accountResult, duplicatesResult] = await Promise.all([
      supabase.from("pinterest_publish_attempts")
        .select("user_id, pin_id, pinterest_account_id, pinterest_board_id, status, retry_safe")
        .eq("user_id", String(req.userId))
        .eq("pin_id", String(updated.pin_id))
        .eq("pinterest_account_id", String(accountId || ""))
        .limit(1),
      supabase.from("pinterest_publications")
        .select("user_id, pin_id, pinterest_account_id")
        .eq("user_id", String(req.userId))
        .eq("pin_id", String(updated.pin_id))
        .eq("pinterest_account_id", String(accountId || ""))
        .limit(1),
      accountId
        ? supabase.from("pinterest_accounts")
            .select("id")
            .eq("user_id", String(req.userId))
            .eq("id", accountId)
            .is("disconnected_at", null)
            .not("access_token", "is", null)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("pin_schedules")
        .select("id")
        .eq("user_id", String(req.userId))
        .eq("pin_id", String(updated.pin_id))
        .eq("pinterest_account_id", String(accountId || ""))
        .in("status", ["scheduled", "publishing", "published", "unknown"])
        .neq("id", String(updated.id))
        .limit(1),
    ]);
    const metadataError = attemptsResult.error || publicationsResult.error ||
      accountResult.error || duplicatesResult.error;
    if (metadataError) {
      logError("index.event_006");
      return res.json(sanitizeScheduleForClient({
        ...updated,
        retryable: false,
        retry_reason: "metadata_unavailable",
        failure_reason: getScheduleFailureReason(updated),
      }));
    }

    let attempts;
    let publications;
    let duplicates;
    const accountData = accountResult.data;
    const accountMalformed = accountData != null && (
      typeof accountData !== "object" || Array.isArray(accountData) || String(accountData.id || "") !== accountId
    );
    try {
      attempts = readArrayQueryResult(attemptsResult);
      publications = readArrayQueryResult(publicationsResult);
      duplicates = readArrayQueryResult(duplicatesResult);
    } catch {
      logError("index.event_006");
      return res.json(sanitizeScheduleForClient({
        ...updated,
        retryable: false,
        retry_reason: "metadata_unavailable",
        failure_reason: getScheduleFailureReason(updated),
      }));
    }
    if (accountMalformed) {
      logError("index.event_006");
      return res.json(sanitizeScheduleForClient({
        ...updated,
        retryable: false,
        retry_reason: "metadata_unavailable",
        failure_reason: getScheduleFailureReason(updated),
      }));
    }
    const retry = getScheduleRetryability(
      updated,
      attempts[0] || null,
      publications.length > 0,
      !!accountId && !!accountData,
      duplicates.length > 0
    );
    res.json(sanitizeScheduleForClient({
      ...updated,
      retryable: retry.retryable,
      retry_reason: retry.reason,
      failure_reason: getScheduleFailureReason(updated),
    }));
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/pins/:id/schedule", requireAuth, pinterestScheduleLimiter, requireTariff(["start", "pro", "agency"]), async (req, res) => {
  try {
    // Лимит тарифа: пины в статусах scheduled и publishing. Проверка до записи,
    // чтобы отказ был предсказуемым ответом, а не конфликтом на вставке.
    const tariffState = await getTariffState(req.userId);
    await billing.assertSchedulePinLimit(supabase, req.userId, tariffState);
    const pin = await getPinWithOwnerCheck(req.params.id, req.userId);
    if (pin.status !== "approved") {
      throw httpError(409, "Запланировать можно только одобренные пины");
    }
    if (!pin.image_url) throw validationError("pin_image_missing", "У пина нет сохранённого изображения");
    const scheduledAtRaw = String((req.body && req.body.scheduled_at) || "").trim();
    const scheduledAt = new Date(scheduledAtRaw);
    if (!scheduledAtRaw || Number.isNaN(scheduledAt.getTime())) {
      throw validationError("invalid_schedule_time", "Укажите корректные дату и время публикации");
    }
    if (scheduledAt.getTime() < Date.now() - 10 * 60 * 1000) {
      throw validationError("invalid_schedule_time", "Время публикации не может быть в прошлом");
    }
    if (scheduledAt.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) {
      throw validationError("schedule_too_far", "Нельзя планировать публикацию более чем на год вперёд");
    }
    const pinterestBoardId = String(
      (req.body && (req.body.pinterest_board_id || req.body.board_id)) || ""
    ).trim();
    if (!pinterestBoardId || pinterestBoardId.length > 128) {
      throw validationError("board_selection_required", "Выберите существующую доску Pinterest перед планированием публикации");
    }
    const timezone = String((req.body && req.body.timezone) || "Europe/Moscow").trim();
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      throw validationError("invalid_timezone", "Некорректный часовой пояс");
    }
    let destinationUrl = null;
    if (req.body && req.body.destination_url) {
      try {
        destinationUrl = normalizePinterestDestinationUrl(req.body.destination_url);
      } catch {
        throw validationError("project_url_invalid", "Укажите корректную HTTP- или HTTPS-ссылку длиной до 2048 символов без логина и пароля.");
      }
    }

    // Persist the exact Pinterest identity with the schedule; the worker must
    // never guess which connected profile should receive a scheduled pin.
    const pinterest = require("./pinterest");
    const requestedAccountId = req.body && (req.body.pinterest_account_id || req.body.account_id)
      ? String(req.body.pinterest_account_id || req.body.account_id)
      : null;
    const selectedAccount = await pinterest.resolveAccount(req.userId, requestedAccountId);
    // Reject stale, foreign or inaccessible board IDs before persisting a schedule.
    // The worker repeats this check at publish time because access may later change.
    await pinterest.verifyPinterestBoard(req.userId, pinterestBoardId, selectedAccount.id);

    // Re-read after the external board check so a concurrent image/title edit
    // cannot make this schedule snapshot stale before it is persisted.
    const snapshotPin = await getPinWithOwnerCheck(req.params.id, req.userId);
    if (snapshotPin.status !== "approved" || !snapshotPin.image_url) {
      throw httpError(409, "Пин изменился во время планирования. Проверьте его и повторите действие.");
    }

    // Freeze the approved creative and the resolved link at schedule time.
    let snapshotDestinationUrl = destinationUrl;
    if (!snapshotDestinationUrl && snapshotPin.boards?.projects?.website_url) {
      try {
        snapshotDestinationUrl = normalizePinterestDestinationUrl(snapshotPin.boards.projects.website_url);
      } catch {
        throw validationError("project_url_invalid", "У проекта сохранена некорректная ссылка для публикации. Исправьте адрес сайта в настройках проекта.");
      }
    }

    const { data, error } = await supabase
      .from("pin_schedules")
      .insert({
        user_id: String(req.userId),
        pin_id: pin.id,
        pinterest_account_id: selectedAccount.id,
        scheduled_at: scheduledAt.toISOString(),
        timezone,
        // Persist the resolved destination, including the project's website fallback.
        // The same value is used by duplicate-request reconciliation below.
        destination_url: snapshotDestinationUrl,
        ...buildPinScheduleSnapshot(snapshotPin, snapshotDestinationUrl),
        pinterest_board_id: pinterestBoardId,
        status: "scheduled",
      })
      .select("*, pins(id, board_id, title, description, image_url, boards(id, title))")
      .single();
    if (error && error.code === "23505") {
      // The partial unique index allows only one active/uncertain schedule per
      // pin. A client may lose the 201 response after the insert committed and
      // retry the same request; return the existing row only for an exact match.
      const { data: existing, error: existingError } = await supabase
        .from("pin_schedules")
        .select("*, pins(id, board_id, title, description, image_url, boards(id, title))")
        .eq("user_id", String(req.userId))
        .eq("pin_id", pin.id)
        .in("status", ["scheduled", "publishing", "published", "unknown"])
        .maybeSingle();
      if (existingError) throw existingError;
      const sameRequest = isSamePinScheduleRequest(existing, {
        scheduledAt,
        timezone,
        destinationUrl: snapshotDestinationUrl,
        pinterestBoardId,
        pinterestAccountId: selectedAccount.id,
      });
      if (sameRequest) {
        return res.status(200).json(sanitizeScheduleForClient(existing));
      }
      throw conflictError("pin_already_scheduled", "Этот пин уже находится в расписании или был опубликован. Проверьте календарь перед повторным планированием.");
    }
    if (error) throw error;
    res.status(201).json(sanitizeScheduleForClient(data));
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/schedule/:id/change-board", requireAuth, pinterestScheduleLimiter, requireTariff(["start", "pro", "agency"]), async (req, res) => {
  try {
    const newBoardId = String((req.body && req.body.pinterest_board_id) || "").trim();
    if (!newBoardId || newBoardId.length > 128) {
      throw validationError("board_selection_required", "Выберите доску Pinterest из списка доступных досок.");
    }

    const { data: schedule, error: scheduleError } = await supabase
      .from("pin_schedules")
      .select("id, user_id, pin_id, pinterest_account_id, pinterest_board_id, status")
      .eq("id", req.params.id)
      .eq("user_id", String(req.userId))
      .maybeSingle();
    if (scheduleError) throw scheduleError;
    if (!schedule) throw notFoundError("schedule_not_found", "Расписание не найдено");
    if (schedule.status !== "failed") {
      throw conflictError("publication_not_failed", "Заменить доску можно только у публикации со статусом «Ошибка».");
    }
    if (!schedule.pinterest_account_id) {
      throw httpError(409, "У расписания не указан Pinterest-аккаунт. Сначала восстановите привязку аккаунта.");
    }

    // Verify the replacement board against the same connected Pinterest identity.
    // The database RPC repeats all safety checks atomically before re-queueing.
    const pinterest = require("./pinterest");
    await pinterest.resolveAccount(req.userId, schedule.pinterest_account_id);
    await pinterest.verifyPinterestBoard(
      req.userId,
      newBoardId,
      schedule.pinterest_account_id
    );

    const { data: changed, error: changeError } = await supabase.rpc("change_failed_pin_schedule_board", {
      p_user_id: String(req.userId),
      p_schedule_id: schedule.id,
      p_new_board_id: newBoardId,
    });
    if (changeError) throw changeError;
    if (!changed || changed.ok !== true) {
      const reasons = {
        account_unavailable: [409, "Pinterest-аккаунт отключён. Подключите его заново."],
        schedule_not_retryable: [409, "Расписание уже изменилось и больше не доступно для смены доски."],
        publication_attempt_exists: [409, "Попытка публикации уже могла состояться. Смена доски заблокирована во избежание дубликата."],
        attempt_identity_mismatch: [409, "Журнал предыдущей попытки относится к другому аккаунту или доске. Автоматическая смена доски заблокирована; требуется сверка."],
        active_schedule_exists: [409, "Для этого пина уже существует другое активное расписание."],
        pin_unavailable: [404, "Исходный пин больше недоступен."],
        invalid_board: [422, "Некорректный идентификатор доски Pinterest."],
        board_change_not_applicable: [409, "Сменить доску можно только после подтверждённой ошибки доступа к предыдущей доске."],
        schedule_not_found: [404, "Расписание не найдено."],
      };
      const [status, message] = reasons[changed && changed.reason] || [409, "Не удалось безопасно изменить доску публикации."];
      throw httpError(status, message);
    }

    const { data: updated, error: readError } = await supabase
      .from("pin_schedules")
      .select("*, pins(id, board_id, title, description, image_url, status, boards(id, title))")
      .eq("id", schedule.id)
      .eq("user_id", String(req.userId))
      .single();
    if (readError) throw readError;
    res.json(sanitizeScheduleForClient(updated));
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/schedule/:id/retry", requireAuth, pinterestScheduleLimiter, requireTariff(["start", "pro", "agency"]), async (req, res) => {
  try {
    const { data: schedule, error: scheduleError } = await supabase
      .from("pin_schedules")
      .select("id, user_id, pin_id, pinterest_account_id, pinterest_board_id, status")
      .eq("id", req.params.id)
      .eq("user_id", String(req.userId))
      .maybeSingle();
    if (scheduleError) throw scheduleError;
    if (!schedule) throw notFoundError("schedule_not_found", "Расписание не найдено");
    if (schedule.status !== "failed") {
      throw conflictError("publication_not_failed", "Повторить можно только публикацию со статусом «Ошибка»");
    }
    if (!schedule.pinterest_account_id || !schedule.pinterest_board_id) {
      throw httpError(422, "Для повтора требуется подключённый Pinterest-аккаунт и выбранная доска");
    }

    // Revalidate the exact original account and remote board before making it due.
    const pinterest = require("./pinterest");
    await pinterest.resolveAccount(req.userId, schedule.pinterest_account_id);
    await pinterest.verifyPinterestBoard(
      req.userId,
      schedule.pinterest_board_id,
      schedule.pinterest_account_id
    );

    const { data: retried, error: retryError } = await supabase.rpc("retry_failed_pin_schedule", {
      p_user_id: String(req.userId),
      p_schedule_id: schedule.id,
    });
    if (retryError) throw retryError;
    if (!retried || retried.ok !== true) {
      const reasons = {
        account_unavailable: [409, "Pinterest-аккаунт отключён. Подключите его заново."],
        schedule_not_retryable: [409, "Это расписание уже изменилось и больше не доступно для повтора."],
        publication_attempt_exists: [409, "Попытка отправки уже была зарегистрирована. Повтор заблокирован во избежание дубликата."],
        attempt_identity_mismatch: [409, "Журнал предыдущей попытки относится к другому аккаунту или доске. Повтор заблокирован; требуется сверка."],
        active_schedule_exists: [409, "Для этого пина уже есть другое активное расписание в выбранном Pinterest-аккаунте."],
        board_missing: [422, "У расписания не указана доска Pinterest."],
        pin_unavailable: [404, "Пин больше недоступен."],
        schedule_not_found: [404, "Расписание не найдено."],
      };
      const [status, message] = reasons[retried && retried.reason] || [409, "Не удалось безопасно повторить публикацию."];
      throw httpError(status, message);
    }

    const { data: updated, error: readError } = await supabase
      .from("pin_schedules")
      .select("*, pins(id, board_id, title, description, image_url, boards(id, title))")
      .eq("id", schedule.id)
      .eq("user_id", String(req.userId))
      .single();
    if (readError) throw readError;
    res.json(sanitizeScheduleForClient(updated));
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/schedule/:id/cancel", requireAuth, pinterestScheduleLimiter, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("pin_schedules")
      .update({ status: "cancelled", next_attempt_at: null, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("user_id", String(req.userId))
      .eq("status", "scheduled")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // Distinguish a missing/foreign schedule from a real state conflict.
      // The conditional UPDATE above is the cancellation linearization point:
      // if the worker claimed first, never overwrite its publishing claim.
      const { data: current, error: currentError } = await supabase
        .from("pin_schedules")
        .select("*, pins(id, board_id, title, description, image_url, status, boards(id, title))")
        .eq("id", req.params.id)
        .eq("user_id", String(req.userId))
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) throw notFoundError("publication_not_found", "Запланированная публикация не найдена");
      if (current.status === "cancelled") {
        // A previous cancellation may have committed while its HTTP response was
        // lost. Repeating cleanup is safe because it rechecks every live reference.
        if (current.snapshot_image_url) {
          await deletePinImageIfUnreferenced(current.snapshot_image_url).catch((cleanupError) => {
            logError("index.event_005");
          });
        }
        return res.json(sanitizeScheduleForClient(current));
      }
      const message = current.status === "publishing"
        ? "Публикация уже началась и не может быть отменена. Дождитесь результата."
        : current.status === "published"
          ? "Публикация уже отправлена в Pinterest и не может быть отменена."
          : "Статус публикации уже изменился. Обновите расписание и попробуйте снова.";
      throw httpError(409, message);
    }
    if (data.snapshot_image_url) {
      await deletePinImageIfUnreferenced(data.snapshot_image_url).catch((cleanupError) => {
        logError("index.event_004");
      });
    }
    res.json(sanitizeScheduleForClient(data));
  } catch (e) {
    handleError(res, e);
  }
});

// --- Аналитика ---

// Публикационная аналитика по собственным данным сервиса. Метрики Pinterest
// (impressions/saves/clicks) намеренно не возвращаются: они не собираются.
// Ежедневные рекомендации: 5–7 пунктов, одна текстовая модель на пользователя в день.
// Выключено по умолчанию (RECOMMENDATIONS_ENABLED != "true" → 404). Вход — только
// сохранённые доски, пины и снимки трендов; выдуманные числа и «всплески запроса» запрещены.
app.get("/recommendations/daily", requireAuth, aiLimiter, async (req, res) => {
  try {
    const recommendations = require("./recommendations");
    if (!recommendations.recommendationsEnabled()) {
      return res.status(404).json({ ok: false, error: "Рекомендации пока не включены" });
    }
    const language = validateEnum(
      req.query && req.query.language,
      ["en", "ru", "es", "pt", "de", "fr", "zh"],
      "ru",
      "Язык"
    );
    // boards и pins не имеют собственного user_id — владелец определяется через projects.
    const { data: boards, error: boardsError } = await supabase
      .from("boards")
      .select("title")
      .eq("projects.user_id", String(req.userId))
      .order("created_at", { ascending: false })
      .limit(20);
    if (boardsError) throw boardsError;
    const { data: pins, error: pinsError } = await supabase
      .from("pins")
      .select("title, status")
      .eq("boards.projects.user_id", String(req.userId))
      .order("created_at", { ascending: false })
      .limit(40);
    if (pinsError) throw pinsError;
    const result = await recommendations.getDailyRecommendations({
      supabaseClient: supabase,
      userId: req.userId,
      boards: boards || [],
      pins: pins || [],
      language,
    });
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/analytics/summary", requireAuth, async (req, res) => {
  try {
    const { getPublicationSummaryOrUnavailable } = require("./analytics");
    const summary = await getPublicationSummaryOrUnavailable(req.userId);
    res.json(summary);
  } catch (e) {
    handleError(res, e);
  }
});

// --- Кредиты ---

app.get("/credits", requireAuth, async (req, res) => {
  try {
    const balance = await getBalance(req.userId);
    const { data: transactions, error } = await supabase
      .from("credit_transactions")
      .select("*")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ balance, transactions });
  } catch (e) {
    handleError(res, e);
  }
});

// Тестовое пополнение: только при ENABLE_DEV_TOPUP=true вне production (B11)
app.post("/credits/dev-topup", authLimiter, async (req, res) => {
  try {
    const { email, amount } = validateDevTopupRequest(req.body);
    const { data: user, error } = await supabase.from("users").select("id").eq("email", email).single();
    // An operator running this by hand must not be told "no such user" by a failed query: they
    // would go and check the account instead of the database.
    if (error && error.code !== "PGRST116") {
      logError("index.event_026", error);
      throw httpError(503, "Сервис кредитов временно недоступен — повторите позже");
    }
    if (!user) throw notFoundError("user_not_found", "Пользователь не найден");

    const newBalance = await adjustBalance(user.id, amount, "topup", "Тестовое пополнение");
    res.json({ balance: newBalance });
  } catch (e) {
    handleError(res, e);
  }
});

// --- Биллинг (Prodamus) ---

// Каталог тарифов с ценами — фронт берёт сумму из одного источника
app.get("/billing/plans", (req, res) => {
  res.json({ provider: "prodamus", demo: prodamus.isDemo(), configured: prodamus.isConfigured(), plans: billing.planCatalog() });
});

// Создание платежа: pending-запись в subscriptions + ссылка на оплату Prodamus
app.post("/billing/create-payment", requireAuth, paymentCreationLimiter, async (req, res) => {
  try {
    const result = await billing.createPayment(req.userId, req.body, req.get("Idempotency-Key"));
    res.status(201).json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// История подписок текущего пользователя (кабинет → «Тарифы»)
app.get("/billing/subscriptions", requireAuth, async (req, res) => {
  try {
    const state = await getTariffState(req.userId);
    const subscriptions = await billing.listUserSubscriptions(req.userId);
    res.json({ tariff: state, subscriptions });
  } catch (e) {
    handleError(res, e);
  }
});

// --- Пакеты кредитов (разовые покупки, НЕ сгорают) ---

// Каталог пакетов с ценами — фронт берёт суммы из одного источника с вебхуком
app.get("/billing/credit-packs", (req, res) => {
  res.json({
    provider: "prodamus",
    demo: prodamus.isDemo(),
    configured: prodamus.isConfigured(),
    packs: creditPacks.packCatalog(),
  });
});

// Создание покупки пакета: pending-запись в credit_purchases + ссылка на оплату Prodamus
app.post("/billing/credits", requireAuth, paymentCreationLimiter, async (req, res) => {
  try {
    const result = await creditsBilling.createCreditsPayment(req.userId, req.body, req.get("Idempotency-Key"));
    res.status(201).json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// История покупок пакетов + баланс (кабинет → «Тарифы» → «Кредиты»)
app.get("/billing/credit-purchases", requireAuth, async (req, res) => {
  try {
    const purchases = await creditsBilling.listUserCreditPurchases(req.userId);
    const balance = await getBalance(req.userId);
    res.json({ balance, purchases });
  } catch (e) {
    handleError(res, e);
  }
});

// Служебная проверка конфигурации: удобно дёрнуть после деплоя на Render
app.get("/billing/health", (req, res) => {
  res.json({
    configured: prodamus.isConfigured(),
    demo: prodamus.isDemo(),
    offline: prodamus.isOffline(),
    webhook_url: (process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "не задан PUBLIC_BACKEND_URL") + "/billing/webhook",
  });
});
require("./pinterest").registerRoutes(app, { requireAuth, requireTariff, handleError });

// --- Админка ---

function registerAdminProviderRefundRoute(route, action) {
  app.post(route, adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await action(req.userId, req.body || {});
      res.json(result);
    } catch (e) {
      handleError(res, e);
    }
  });
}

// Operator identity always comes from the verified JWT (req.userId), never
// from a request body field. Migration 078 re-checks and locks that identity.
registerAdminProviderRefundRoute(
  "/admin/provider-refunds/generation/reconcile",
  adminProviderRefundActions.reconcileGeneration
);
registerAdminProviderRefundRoute(
  "/admin/provider-refunds/regeneration/reconcile",
  adminProviderRefundActions.reconcileRegeneration
);
registerAdminProviderRefundRoute(
  "/admin/provider-refunds/generation/finalize",
  adminProviderRefundActions.finalizeGeneration
);
registerAdminProviderRefundRoute(
  "/admin/provider-refunds/regeneration/finalize",
  adminProviderRefundActions.finalizeRegeneration
);

// Read-only Pinterest operations inventory. It never claims, retries, or publishes schedules.
app.get("/admin/pinterest/schedules", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await adminPinterestInventory.listPinterestSchedules(req.query || {}, Date.now(), req.userId);
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// Positive-only reconciliation for a Pinterest publication already confirmed externally.
// The operator identity is derived from the verified JWT; the database rechecks admin status.
app.post("/admin/pinterest/reconcile-unknown-publication", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await adminPinterestReconciliation.reconcileUnknownPublication(req.userId, req.body || {});
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// Reconcile only stale uploads whose exact object is already visible in Storage.
// Missing objects remain fenced: absence is not proof that a remote request ended.
app.post("/admin/storage/reconcile-stale-uploads", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await reconcileStalePinImageUploads({
      supabase,
      olderThanSeconds: 900,
      limit: 100,
    });
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});


// Retry only definitively failed deletions. The claim RPC rechecks all durable references
// under a row lock; ambiguous in-flight claims and quarantined paths remain non-retryable.
app.post("/admin/storage/retry-failed-deletions", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(String(req.body && req.body.limit || "25"), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 25;
    const result = await retryFailedPinImageDeletions({ supabase, limit });
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// Read-only inventory of completed generated-image journal references that are older than
// the retention window and have no live pin/schedule/provider-journal references.
// This endpoint does not expire idempotency keys or delete Storage objects.
app.get("/admin/storage/retention-candidates", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsedDays = Number.parseInt(String(req.query.days || "90"), 10);
    const parsedLimit = Number.parseInt(String(req.query.limit || "100"), 10);
    const days = Number.isFinite(parsedDays) ? Math.min(3650, Math.max(30, parsedDays)) : 90;
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 100;
    const { data, error } = await supabase.rpc("list_pin_image_retention_candidates", {
      p_retention_days: days,
      p_limit: limit,
    });
    if (error) throw error;
    res.json({ retention_days: days, read_only: true, candidates: readArrayQueryResult({ data, error }) });
  } catch (e) {
    handleError(res, e);
  }
});

// Expire only old, definitively completed replay results. The SQL RPC preserves
// idempotency tombstones and queues image paths for a later fenced cleanup phase;
// this operation does not clear payloads or delete Storage objects.
app.post("/admin/storage/expire-replay-results", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsedDays = Number.parseInt(String(req.body && req.body.days || "90"), 10);
    const parsedLimit = Number.parseInt(String(req.body && req.body.limit || "100"), 10);
    const days = Number.isFinite(parsedDays) ? Math.min(3650, Math.max(30, parsedDays)) : 90;
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 100;
    const { data, error } = await supabase.rpc("expire_pin_image_replay_results", {
      p_retention_days: days,
      p_limit: limit,
    });
    if (error) throw error;
    res.json({ ...data, retention_days: days, replay_expiry_only: true });
  } catch (e) {
    handleError(res, e);
  }
});

// Retire only replay payloads already protected by expiry tombstones. The SQL
// transaction clears journal image URLs and releases queue paths only when no
// live pin, schedule, or remaining journal reference exists; Storage is untouched.
app.post("/admin/storage/retire-expired-replay-references", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(String(req.body && req.body.limit || "50"), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 50;
    const { data, error } = await supabase.rpc("retire_expired_pin_image_replay_references", {
      p_limit: limit,
    });
    if (error) throw error;
    res.json({ ...data, replay_reference_retirement_only: true });
  } catch (e) {
    handleError(res, e);
  }
});

// Process only queue rows released by transactional replay retirement. Every object
// still passes through claim_pin_image_deletion immediately before Storage DELETE.
app.post("/admin/storage/process-retention-queue", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(String(req.body && req.body.limit || "10"), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(25, Math.max(1, parsedLimit)) : 10;
    const result = await processPendingPinImageRetentionQueue({ supabase, limit });
    res.json({ ...result, storage_deletion_worker: true });
  } catch (e) {
    handleError(res, e);
  }
});

// Read-only diagnostics for blocked replay-retention queue rows. Storage presence is
// observational only: this endpoint never retries a delete or reopens a queue item.
app.get("/admin/storage/retention-queue/blocked", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(String(req.query.limit || "50"), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 50;
    const result = await inspectBlockedPinImageRetentionQueue({ supabase, limit });
    res.json({ ...result, read_only: true, automatic_reconciliation: false });
  } catch (e) {
    handleError(res, e);
  }
});

// Read-only inventory of permanently quarantined image paths. It never deletes or reopens objects.
app.get("/admin/storage/quarantined-objects", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(String(req.query.limit || "50"), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 50;
    const result = await inspectQuarantinedPinImageObjects({ supabase, limit });
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// Permanently retire stale upload paths. Any late Storage completion becomes
// an unreferenced orphan; the path is never reused or automatically deleted.
app.post("/admin/storage/quarantine-stale-uploads", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await quarantineStalePinImageUploads({
      supabase,
      olderThanSeconds: 900,
      limit: 100,
    });
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/admin/stats", requireAuth, requireAdmin, async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (e) {
    handleError(res, e);
  }
});

// Почта поддержки в админке (нужны MAIL_* переменные окружения)
app.get("/admin/mail", requireAuth, requireAdmin, async (req, res) => {
  try {
    const messages = await mail.listInbox(Number(req.query.limit) || 30);
    res.json({ messages });
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/admin/mail/:uid", requireAuth, requireAdmin, async (req, res) => {
  try {
    const message = await mail.fetchMessageBody(req.params.uid);
    res.json(message);
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/admin/mail/reply", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = req.body && !Array.isArray(req.body) ? req.body : {};
    const { to, subject, text } = body;
    if (!to || !subject || !text) throw httpError(422, "Нужны поля to, subject, text");
    const result = await mail.replyToMessage(to, subject, text);
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// Read-only queue for unresolved AI-provider operations and old active credit reservations.
app.get("/admin/financial-operations/unresolved", requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsedAge = Number.parseInt(String(req.query.older_than_minutes || "30"), 10);
    const olderThanMinutes = Number.isFinite(parsedAge)
      ? Math.min(24 * 60 * 30, Math.max(5, parsedAge))
      : 30;
    const parsedLimit = Number.parseInt(String(req.query.limit || "50"), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 50;
    const queue = await getFinancialOperationsQueue({ olderThanMinutes, limit });
    res.json(queue);
  } catch (e) {
    handleError(res, e);
  }
});

// Read-only operator view of the account-deletion pipeline: counts by state, the oldest
// pending request and the jobs that need a person (blocked or exhausted). The worker
// reports those only in its structured log, and a stalled deletion has a legal deadline.
app.get("/admin/account-deletion/inventory", requireAuth, requireAdmin, async (req, res) => {
  try {
    const inventory = await getAccountDeletionInventory({ limit: req.query.limit });
    res.json(inventory);
  } catch (e) {
    handleError(res, e);
  }
});

// Список подписок и платежей для админки
app.get("/admin/subscriptions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const data = await billing.listAllSubscriptions(Number(req.query.limit) || 200);
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

// Privacy-safe health summary for the durable transactional email outbox.
app.get("/admin/billing/email-outbox", requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(String(req.query.limit || "20"), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 20;
    const health = await billing.getEmailOutboxHealth(limit);
    res.json(health);
  } catch (e) {
    handleError(res, e);
  }
});

// A dead transactional email is otherwise lost forever: the dispatcher gives up after max_attempts
// and nothing in the product could put the message back, so a paying customer whose activation email
// died was simply never told. Operator-only, one row at a time, and the database decides what is
// requeueable so a refusal can never be reported as success.
app.post("/admin/billing/email-outbox/:id/requeue", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await billing.requeueEmailOutbox(req.params && req.params.id);
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// Operator visibility and recovery for the durable login lockout (migration 164).
// Without this, an attacker who knows the operator's address can lock the account and the owner has
// no supported way back in; a customer who mistyped a password five times would also have to wait.
app.get("/admin/accounts/login-lockout", requireAuth, requireAdmin, async (req, res) => {
  try {
    const email = validateEmail(req.query && req.query.email);
    const state = await loginLockout.adminState(email);
    res.json({ email, ...state });
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/admin/accounts/login-lockout/reset", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const email = validateEmail(req.body && req.body.email);
    const result = await loginLockout.adminReset(email);
    res.json({ email, ...result });
  } catch (e) {
    handleError(res, e);
  }
});

// Read-only, privacy-safe freshness/status for the separately invoked Pinterest scheduler.
app.get("/admin/operations/pinterest-scheduler", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("pinterest_scheduler_monitor")
      .select("status, last_started_at, last_completed_at, claimed, published, failed, scheduled, unknown, last_error_code")
      .eq("singleton_key", "pinterest_scheduler")
      .maybeSingle();
    if (error) throw error;
    const { summarizePinterestSchedulerHealth } = require("./pinterestSchedulerHealth");
    res.json({
      generated_at: new Date().toISOString(),
      ...summarizePinterestSchedulerHealth(data),
    });
  } catch (e) {
    handleError(res, e);
  }
});

// Read-only inventory of payment checkout requests whose provider outcome is unresolved.
app.get("/admin/billing/payment-creation-requests", adminActionLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await adminPaymentCreationRequests.listPaymentCreationRequests(req.query || {});
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

// Журнал исключений платёжных вебхуков (только администратор).
app.get("/admin/billing/webhook-exceptions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(String(req.query.limit || "50"), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(200, Math.max(1, parsedLimit)) : 50;
    const { data, error } = await supabase
      .from("billing_webhook_exceptions")
      .select("id, provider, payment_kind, order_id, payment_status, received_sum, received_currency, expected_amount, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ exceptions: readArrayQueryResult({ data, error }) });
  } catch (e) {
    handleError(res, e);
  }
});

// Read-only inventory of old pending provider orders. This is deliberately
// not a "fail" or "retry" action: age alone cannot prove that Prodamus did not
// collect a payment or that a delayed webhook will never arrive.
app.get("/admin/billing/pending-orders", requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsedHours = Number.parseInt(String(req.query.older_than_hours || "24"), 10);
    const olderThanHours = Number.isFinite(parsedHours)
      ? Math.min(24 * 30, Math.max(1, parsedHours))
      : 24;
    const parsedLimit = Number.parseInt(String(req.query.limit || "50"), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 50;
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

    const [subscriptionsResult, creditsResult] = await Promise.all([
      supabase.from("subscriptions")
        .select("id, user_id, provider_payment_id, plan, amount, currency, created_at")
        .eq("status", "pending")
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(limit),
      supabase.from("credit_purchases")
        .select("id, user_id, provider_payment_id, package_id, credits, amount, currency, created_at")
        .eq("status", "pending")
        .is("balance_credited_at", null)
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(limit),
    ]);
    if (subscriptionsResult.error) throw subscriptionsResult.error;
    if (creditsResult.error) throw creditsResult.error;
    const subscriptions = readArrayQueryResult(subscriptionsResult);
    const creditPurchases = readArrayQueryResult(creditsResult);

    const now = Date.now();
    const orders = [
      ...subscriptions.map((row) => ({
        kind: "subscription", ...row,
        age_hours: Math.max(0, Math.floor((now - new Date(row.created_at).getTime()) / 3600000)),
      })),
      ...creditPurchases.map((row) => ({
        kind: "credits", ...row,
        age_hours: Math.max(0, Math.floor((now - new Date(row.created_at).getTime()) / 3600000)),
      })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    res.json({
      older_than_hours: olderThanHours,
      limit_per_kind: limit,
      count: orders.length,
      orders,
      note: "Read-only inventory. Do not mark an order failed based on age alone; reconcile with Prodamus first.",
    });
  } catch (e) {
    handleError(res, e);
  }
});

// --- Финальные обработчики ---

app.use((req, res) => {
  res.status(404).json({ error: "Не найдено" });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Домен не разрешён" });
  }
  if (err && (err.type === "entity.parse.failed" || err instanceof SyntaxError)) {
    return res.status(400).json({ error: "Некорректный JSON в запросе" });
  }
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Слишком большой запрос" });
  }
  logError("index.event_003");
  res.status(500).json({ error: "Внутренняя ошибка сервера, попробуйте позже" });
});

const PORT = process.env.PORT || 3000;

// The database outbox is durable; this in-process dispatcher is only a delivery
// mechanism. It runs on startup, after payment callbacks, and while the service
// is awake. A Render sleep can delay retries until the next request/startup.
function dispatchSubscriptionEmailOutbox() {
  const correlationId = crypto.randomUUID();
  return runWithCorrelationId(correlationId, () =>
    billing.dispatchPendingSubscriptionEmails(10).catch(() => {
      logError("index.event_002");
    })
  );
}
const emailOutboxTimer = setInterval(dispatchSubscriptionEmailOutbox, 60 * 1000);
if (typeof emailOutboxTimer.unref === "function") emailOutboxTimer.unref();

// The account-deletion pipeline runs only behind the shared explicit opt-in.
// The standalone worker entrypoint uses the same gate to prevent bypass.
const { isAccountDeletionWorkerEnabled } = require("./accountDeletionWorkerGate");
let accountDeletionWorker = null;
if (isAccountDeletionWorkerEnabled()) {
  const { createAccountDeletionWorker } = require("./accountDeletionWorker");
  accountDeletionWorker = createAccountDeletionWorker({ client: supabase });
  accountDeletionWorker.start();
  logInfo("account_deletion_worker.enabled");
} else if (process.env.NODE_ENV === "production") {
  logWarning("account_deletion_worker.disabled_in_production");
}

// Раздел 159: проверки конфигурации печатаются ДО попытки занять порт. Раньше они стояли внутри
// колбэка app.listen и при занятом порту не появлялись вовсе — то есть именно тогда, когда сервер
// не поднялся и его диагностика нужнее всего.
const mailPlaceholders = require("./mail").unresolvedMailPlaceholders();
if (mailPlaceholders.length > 0) logWarning("mail.config_placeholder");
if (require("./mail").looksLikePlaceholder(process.env.GPTUNNEL_API_KEY)) logWarning("ai.provider_placeholder");

const server = app.listen(PORT, () => {
  logInfo("index.event_001");
  dispatchSubscriptionEmailOutbox();
});

// Hosted platforms send SIGTERM during deploys/restarts. Stop new HTTP work,
// stop the in-process outbox timer, and allow active requests a bounded drain.
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  logInfo("index.shutdown_started");
  clearInterval(emailOutboxTimer);
  if (accountDeletionWorker) {
    void accountDeletionWorker.stop().catch(() => {
      logError("account_deletion_worker.shutdown_failed");
    });
  }

  const forceExit = setTimeout(() => {
    logError("index.shutdown_timeout");
    process.exit(1);
  }, 10_000);

  server.close((error) => {
    clearTimeout(forceExit);
    if (error) {
      logError("index.shutdown_failed");
      process.exitCode = 1;
      return;
    }
    logInfo("index.shutdown_completed");
    process.exitCode = 0;
  });
  // Do not wait for idle keep-alive sockets to expire naturally.
  if (typeof server.closeIdleConnections === "function") {
    server.closeIdleConnections();
  }
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
