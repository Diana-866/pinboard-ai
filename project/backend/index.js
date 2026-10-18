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
      const allowedOrigins = [
        process.env.FRONTEND_URL || "https://pinboard-ai-web.vercel.app",
        "http://localhost:3000",
      ];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);
app.use(express.json({ limit: "100kb" })); // ограничение размера тела (B12)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток. Попробуйте через 15 минут." },
});

// Лимит для дорогих AI-эндпоинтов: генерация тратит реальный баланс GPTunnel (B12)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов. Подождите минуту." },
});

const { generateImage } = require("./gptunnel");
const { register, login, verifyToken } = require("./auth");
const supabase = require("./supabase");
const { analyzeSite } = require("./analyze");
const { generateBoards } = require("./boards");
const { generatePins } = require("./pins");

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

  if (code >= 500) {
    return res.status(code).json({
      error: publicMessage || "Внутренняя ошибка сервера, попробуйте позже",
    });
  }
  return res.status(code).json({ error: publicMessage || (e && e.message) || "Ошибка запроса" });
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
    const result = await register(email, password);
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

app.get("/me", requireAuth, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, name, credits_balance, subscription_tier, is_admin")
      .eq("id", req.userId)
      .single();

    if (error || !user) throw httpError(404, "Пользователь не найден");

    res.json(user);
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

app.post("/projects/:id/boards/generate", aiLimiter, requireAuth, async (req, res) => {
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

app.post("/pins/:id/regenerate", aiLimiter, requireAuth, async (req, res) => {
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

app.post("/boards/:id/pins/generate", aiLimiter, requireAuth, async (req, res) => {
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

// --- Админка ---

app.get("/admin/stats", requireAuth, requireAdmin, async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
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
