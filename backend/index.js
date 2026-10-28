const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { getBalance, adjustBalance } = require("./credits");
const { requireAdmin, getStats } = require("./admin");
const {
  httpError,
  validateEmail,
  validatePassword,
  optionalString,
  validateUrl,
  validateEnum,
  validateInt,
} = require("./validate");

const MODEL_PRICES = {
  "flux-schnell": 0.6,
  "grom-nova": 1.5,
  "nano-banana-2-lite": 9.6,
  "nano-banana-pro": 15,
};
const MARKUP = 1.5;
const ASPECT_RATIOS = ["2:3", "9:16", "4:5", "3:4", "1:1"];

const app = express();
app.set("trust proxy", 1); // за прокси (Render/nginx) реальный IP клиента — иначе лимиты бьют по всем сразу (B3)
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
// Вебхук Prodamus приходит как application/x-www-form-urlencoded — парсим его
// отдельным middleware ровно на своём пути, до json-парсера и до CORS-ответов.
app.post(
  "/billing/webhook",
  express.urlencoded({ extended: true, limit: "100kb", type: () => true }),
  async (req, res) => {
    try {
      await billing.handleWebhook(req, res);
    } catch (e) {
      console.error("[billing] ошибка обработки вебхука:", e && e.message);
      if (!res.headersSent) res.status(500).json({ ok: false, error: "internal" });
    }
  }
);

app.use(express.json({ limit: "100kb" })); // ограничение размера тела (B12)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток. Попробуйте через 15 минут." },
});

// Лимит для дорогих AI-эндпоинтов: генерация тратит реальный баланс GPTunnel (B12)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов. Подождите минуту." },
});

// Лимит для одноразовых ссылок из писем: попыток перебора токенов быть не должно
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов. Попробуйте через 15 минут." },
});

const { generateImage } = require("./gptunnel");
const { register, login, verifyToken } = require("./auth");
const supabase = require("./supabase");
const { analyzeSite } = require("./analyze");
const { generateBoards } = require("./boards");
const { generatePins } = require("./pins");
const { uploadPinImage } = require("./storage");
const mail = require("./mail");
const passwordReset = require("./password-reset");
const emailVerify = require("./email-verify");
const billing = require("./billing");
const prodamus = require("./prodamus");
const { requireTariff, getTariffState } = require("./tariff");

// Загрузка своих изображений пинов (замена временных ссылок GPTunnel на постоянные)
const multer = require("multer");
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

if (!process.env.JWT_SECRET) {
  console.warn("[startup] JWT_SECRET не задан — регистрация и вход работать не будут");
}
if (!process.env.GPTUNNEL_API_KEY) {
  console.warn("[startup] GPTUNNEL_API_KEY не задан — AI-генерация работать не будет");
}

function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new Error("Нет токена");
    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    next();
  } catch (e) {
    res.status(401).json({ error: "Не авторизован" });
  }
}

// Единый обработчик: коды 4xx отдают понятное сообщение, 5xx — не раскрывают внутренности (B10)
function handleError(res, e, publicMessage, status) {
  const code = status || (e && e.httpStatus) || (publicMessage ? 400 : 500);
  if (code >= 500) console.error(e);
  else console.error(`[warn] ${code}: ${e && e.message}`);

  // Дополнительные поля (например, 403 email_not_verified: retryAfterSeconds/emailSent)
  // отдаём рядом с error — фронт показывает точное сообщение без повторных запросов.
  const extra = e && e.details && typeof e.details === "object" ? e.details : null;

  if (code >= 500) {
    return res.status(code).json({
      error: publicMessage || "Внутренняя ошибка сервера, попробуйте позже",
    });
  }
  return res.status(code).json({
    error: publicMessage || (e && e.message) || "Ошибка запроса",
    ...(extra || {}),
  });
}

app.get("/", (req, res) => {
  res.send("OK");
});

// Health-check для мониторинга/автопробуждения (B15)
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// --- Аутентификация ---

app.post("/register", authLimiter, async (req, res) => {
  try {
    const email = validateEmail(req.body && req.body.email);
    const password = validatePassword(req.body && req.body.password);
    const result = await register(email, password, req.body && req.body.name, req.body && req.body.surname);
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/login", authLimiter, async (req, res) => {
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
app.get("/verify-email", verifyLimiter, async (req, res) => {
  const base = (process.env.FRONTEND_URL || "https://pinposy.com").split(",")[0].trim();
  const wantsJson = String(req.headers.accept || "").includes("application/json");
  try {
    await emailVerify.applyVerification(req.query.token);
    if (wantsJson) return res.json({ ok: true, redirect: `${base}/login?verified=1` });
    return res.redirect(302, `${base}/login?verified=1`);
  } catch (e) {
    const code = e && e.httpStatus ? e.httpStatus : 500;
    const publicMessage =
      code >= 500 ? "Внутренняя ошибка сервера, попробуйте позже" : (e && e.message) || "Ошибка подтверждения";
    if (code >= 500) console.error("[verify-email]", e);
    else console.error(`[warn] ${code}: ${e && e.message}`);
    if (wantsJson) return res.status(code).json({ error: publicMessage, code: "email_verify_failed" });
    // Фронт покажет человекочитаемое сообщение на странице VerifyEmail
    return res.redirect(302, `${base}/verify-email?status=error`);
  }
});

// Повторная отправка письма подтверждения.
// Два режима: с Authorization-токеном (кабинет) или с { email } в теле (страница входа).
// Ответ всегда ok:true — эндпоинт не раскрывает, существует ли такой email.
app.post("/resend-verification", verifyLimiter, async (req, res) => {
  try {
    let userIdFromToken = null;
    try {
      const header = req.headers.authorization || "";
      const token = header.replace(/^Bearer\s+/i, "").trim();
      if (token) userIdFromToken = verifyToken(token).userId;
    } catch {
      userIdFromToken = null; // невалидный токен — просто отвечаем анонимно
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
      req.body && req.body.frontendUrl
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

    if (error || !row) throw httpError(404, "Пользователь не найден");

    res.json({
      id: row.id,
      email: row.email,
      name: row.name ?? null,
      surname: row.surname ?? null,
      credits_balance: row.credits_balance ?? 0,
      subscription_tier: row.subscription_tier ?? "free",
      onboarded: row.onboarded ?? false,
      tariff_plan: row.tariff_plan ?? "none",
      // Дата окончания оплаченного периода (миграция 006). null — тариф без срока/не оплачен.
      tariff_period_end: row.tariff_period_end ?? null,
      // Активна ли подписка прямо сейчас: кабинет по этому полю снимает «замочки».
      subscription_active:
        (row.tariff_plan || "none") !== "none" &&
        (!row.tariff_period_end || new Date(row.tariff_period_end).getTime() > Date.now()),
      payment_provider: "prodamus",
      email_verified: row.email_verified ?? true, // миграция 005; нет колонки — считаем подтверждённым
      is_admin: !!row.is_admin,
    });
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
    if (Object.keys(upd).length === 0) throw httpError(422, "Нечего обновлять");
    const { data, error } = await supabase
      .from("users")
      .update(upd)
      .eq("id", req.userId)
      .select("id, email, name, surname, credits_balance, subscription_tier, is_admin")
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
    const normalizedWebsiteUrl = websiteUrl ? validateUrl(websiteUrl) : null;
    const upd = { onboarded: true };

    const { data, error } = await supabase
      .from("users")
      .update(upd)
      .eq("id", req.userId)
      .select("id, email, onboarded, tariff_plan")
      .single();

    if (error) {
      console.error("[onboarding] не удалось обновить users:", error.message, error.code || "");
      throw httpError(500, "Не удалось сохранить онбординг. Проверьте, что миграция 004 применена в Supabase.");
    }

    // Первая запись проекта: user_id, website_url, goal = комментарий о продукте
    const { data: existing, error: lookupError } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", req.userId)
      .limit(1);
    if (lookupError) {
      console.error("[onboarding] не удалось проверить проекты:", lookupError.message, lookupError.code || "");
    } else if (!existing || existing.length === 0) {
      const { error: projError } = await supabase.from("projects").insert({
        user_id: req.userId,
        website_url: normalizedWebsiteUrl,
        goal: productComment,
        language: "ru",
      });
      if (projError) {
        // Онбординг уже сохранён — проект можно создать позже из кабинета.
        console.error("[onboarding] не удалось создать первую запись проекта:", projError.message, projError.code || "");
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
          console.error("[onboarding] не удалось обновить первый проект:", projectUpdateError.message, projectUpdateError.code || "");
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
    // В продакшене тариф меняется только вебхуком Prodamus.
    // Ручная подмена остаётся для локальной разработки (ALLOW_TARIFF_SELF_SELECT=1)
    // и для администратора (выдать тариф вручную без оплаты).
    if (process.env.ALLOW_TARIFF_SELF_SELECT !== "1" && process.env.NODE_ENV === "production") {
      const { data: me } = await supabase.from("users").select("is_admin").eq("id", req.userId).single();
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
    if (website_url) website_url = validateUrl(website_url);
    const niche = optionalString(req.body && req.body.niche, { max: 120 }) || "";
    const language = optionalString(req.body && req.body.language, { max: 10 }) || "ru";
    const goal = optionalString(req.body && req.body.goal, { max: 500 }) || "";
    const tone = optionalString(req.body && req.body.tone, { max: 500 }) || "";

    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: req.userId, website_url, niche, language, goal, tone })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/projects", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", req.userId);
    if (error) throw error;
    res.json(data);
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
    if (error || !data) throw httpError(404, "Проект не найден");
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/projects/:id/analyze", aiLimiter, requireAuth, async (req, res) => {
  try {
    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();

    if (fetchError || !project) throw httpError(404, "Проект не найден");
    if (!project.website_url) throw httpError(422, "У проекта не указан URL сайта");

    const analysis = await analyzeSite(project.website_url);

    const { data: updated, error: updateError } = await supabase
      .from("projects")
      .update({
        niche: analysis.niche,
        site_summary: analysis.summary,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(updated);
  } catch (e) {
    handleError(res, e);
  }
});

// --- Доски ---

app.post("/projects/:id/boards/generate", aiLimiter, requireAuth, requireTariff(["standard", "pro", "agency", "start"]), async (req, res) => {
  try {
    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();
    if (fetchError || !project) throw httpError(404, "Проект не найден");

    const ideas = await generateBoards(project);

    const rows = ideas.map((b) => ({
      project_id: project.id,
      title: b.title,
      description: b.description,
      status: "new",
    }));

    const { data: inserted, error: insertError } = await supabase.from("boards").insert(rows).select();
    if (insertError) throw insertError;

    res.status(201).json(inserted);
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
    if (fetchError || !project) throw httpError(404, "Проект не найден");

    const { data, error } = await supabase
      .from("boards")
      .select("*")
      .eq("project_id", req.params.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

async function getBoardWithOwnerCheck(boardId, userId) {
  const { data: board, error } = await supabase
    .from("boards")
    .select("*, projects(user_id, niche, tone, goal)")
    .eq("id", boardId)
    .single();
  if (error || !board) throw httpError(404, "Доска не найдена");
  if (board.projects.user_id !== userId) throw httpError(404, "Доска не найдена");
  return board;
}

async function getPinWithOwnerCheck(pinId, userId) {
  const { data: pin, error } = await supabase
    .from("pins")
    .select("*, boards(id, title, description, projects(user_id, niche, tone))")
    .eq("id", pinId)
    .single();
  if (error || !pin) throw httpError(404, "Пин не найден");
  if (pin.boards.projects.user_id !== userId) throw httpError(404, "Пин не найден");
  return pin;
}

// --- Пины ---

app.patch("/pins/:id", requireAuth, async (req, res) => {
  try {
    await getPinWithOwnerCheck(req.params.id, req.userId);
    const title = optionalString(req.body && req.body.title, { max: 100 });
    const description = optionalString(req.body && req.body.description, { max: 500 });
    if (title === null && description === null) {
      throw httpError(422, "Нечего обновлять: передайте title и/или description");
    }
    const update = {};
    if (title !== null) update.title = title;
    if (description !== null) update.description = description;

    const { data, error } = await supabase
      .from("pins")
      .update(update)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/pins/:id/status", requireAuth, async (req, res) => {
  try {
    await getPinWithOwnerCheck(req.params.id, req.userId);
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status)) throw httpError(422, "Некорректный статус");
    const { data, error } = await supabase
      .from("pins")
      .update({ status })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

// Своя картинка пина: постоянное хранилище вместо временных ссылок GPTunnel
app.post("/pins/:id/image", requireAuth, imageUpload.single("image"), async (req, res) => {
  try {
    await getPinWithOwnerCheck(req.params.id, req.userId);
    if (!req.file) throw httpError(422, "Передайте файл в поле image (PNG/JPG/WebP, до 5 МБ)");
    const url = await uploadPinImage(req.file);
    const { data, error } = await supabase
      .from("pins")
      .update({ image_url: url })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/pins/:id/regenerate", aiLimiter, requireAuth, requireTariff(["standard", "pro", "agency", "start"]), async (req, res) => {
  try {
    const pin = await getPinWithOwnerCheck(req.params.id, req.userId);
    const instruction = optionalString(req.body && req.body.instruction, { max: 300 }) || "";
    const model = validateEnum(
      pin.model_used,
      Object.keys(MODEL_PRICES),
      "flux-schnell",
      "Модель"
    );

    const cost = Math.ceil((MODEL_PRICES[model] || 15) * MARKUP);
    const balance = await getBalance(req.userId);
    if (balance < cost) {
      return res.status(402).json({ error: "Недостаточно кредитов", required: cost, balance });
    }

    const prompt = `${pin.title}. ${pin.description}. ${instruction}`.trim();
    const image = await generateImage(prompt, model);
    if (image && image.url) {
      try {
        image.url = await rehostImage(image.url);
      } catch (reErr) {
        console.error(`[regenerate] ре-хостинг не удался: ${reErr && reErr.message}`);
      }
    }
    if (!image || !image.url || image.price == null) {
      throw httpError(502, "Изображение ещё не готово — попробуйте позже, кредиты не списаны");
    }

    await adjustBalance(req.userId, -cost, "regeneration", `Перегенерация пина (${model})`);

    const { data: updated, error } = await supabase
      .from("pins")
      .update({ image_url: image.url, credits_cost: cost })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) {
      // возврат кредитов, если пин не сохранился (частичный фикс B6)
      await adjustBalance(req.userId, cost, "refund", "Возврат кредитов: перегенерация не сохранена").catch(() => {});
      throw httpError(500, "Не удалось сохранить пин, кредиты возвращены на баланс");
    }

    res.json(updated);
  } catch (e) {
    handleError(res, e);
  }
});

// --- Генерация пинов ---

app.get("/boards", requireAuth, async (req, res) => {
  try {
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", req.userId);

    if (projectsError) throw projectsError;

    const projectIds = (projects || []).map((p) => p.id);
    if (projectIds.length === 0) return res.json([]);

    const { data, error } = await supabase
      .from("boards")
      .select("*, projects(niche, website_url)")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/boards/:id", requireAuth, async (req, res) => {
  try {
    const board = await getBoardWithOwnerCheck(req.params.id, req.userId);
    res.json(board);
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/boards/:id/pins", requireAuth, async (req, res) => {
  try {
    await getBoardWithOwnerCheck(req.params.id, req.userId);
    const { data, error } = await supabase
      .from("pins")
      .select("*")
      .eq("board_id", req.params.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/boards/:id/pins/generate", aiLimiter, requireAuth, requireTariff(["standard", "pro", "agency", "start"]), async (req, res) => {
  try {
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

    const estimatedCost = Math.ceil((MODEL_PRICES[model] || 15) * count * MARKUP);
    const balance = await getBalance(req.userId);

    if (balance < estimatedCost) {
      return res.status(402).json({
        error: "Недостаточно кредитов для этой генерации",
        required: estimatedCost,
        balance,
      });
    }

    const pinsData = await generatePins(board, board.projects, model, count, aspectRatio, mixedRatios);

    // B8: вставляем только пины с готовой картинкой и известной ценой
    const okPins = pinsData.filter((p) => p && p.image_url && p.credits_cost != null);
    if (okPins.length === 0) {
      throw httpError(502, "Не удалось сгенерировать ни одного изображения. Кредиты не списаны — попробуйте ещё раз.");
    }

    const markedUpPins = okPins.map((p) => ({
      ...p,
      credits_cost: Math.ceil(p.credits_cost * MARKUP),
    }));
    const totalCharge = markedUpPins.reduce((sum, p) => sum + p.credits_cost, 0);

    await adjustBalance(
      req.userId,
      -totalCharge,
      "generation",
      `Генерация ${markedUpPins.length} пинов (${model})`
    );

    const { data: inserted, error } = await supabase.from("pins").insert(markedUpPins).select();
    if (error) {
      // возврат кредитов, если пины не сохранились (частичный фикс B6)
      await adjustBalance(req.userId, totalCharge, "refund", "Возврат кредитов: генерация не сохранена").catch(() => {});
      throw httpError(500, "Не удалось сохранить пины, кредиты возвращены на баланс");
    }

    res.status(201).json(inserted);
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
app.post("/credits/dev-topup", async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEV_TOPUP !== "true") {
      throw httpError(404, "Не найдено");
    }
    const { email, amount, adminSecret } = req.body;
    if (adminSecret !== process.env.ADMIN_SECRET) throw httpError(401, "Не авторизован");

    const { data: user, error } = await supabase.from("users").select("id").eq("email", email).single();
    if (error || !user) throw httpError(404, "Пользователь не найден");

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
app.post("/billing/create-payment", requireAuth, async (req, res) => {
  try {
    const result = await billing.createPayment(req.userId, req.body);
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

// Служебная проверка конфигурации: удобно дёрнуть после деплоя на Render
app.get("/billing/health", (req, res) => {
  res.json({
    configured: prodamus.isConfigured(),
    demo: prodamus.isDemo(),
    offline: prodamus.isOffline(),
    webhook_url: (process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "не задан PUBLIC_BACKEND_URL") + "/billing/webhook",
  });
});

// --- Админка ---

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

app.post("/admin/mail/reply", requireAuth, requireAdmin, async (req, res) => {
  try {
    const to = String((req.body && req.body.to) || "").trim();
    const subject = String((req.body && req.body.subject) || "").trim();
    const text = String((req.body && req.body.text) || "").trim();
    if (!to || !subject || !text) throw httpError(422, "Нужны поля to, subject, text");
    const result = await mail.replyToMessage(to, subject, text);
    res.json(result);
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
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера, попробуйте позже" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
