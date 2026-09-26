const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { getBalance, adjustBalance } = require("./credits");

const MODEL_PRICES = {
  "flux-schnell": 0.6,
  "grom-nova": 1.5,
  "nano-banana-2-lite": 9.6,
  "nano-banana-pro": 15,
};
const MARKUP = 1.5;

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL || "https://pinboard-ai-web.vercel.app",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Слишком много попыток. Попробуйте через 15 минут." },
});

const { generateText, generateImage, listModels, checkImage } = require("./gptunnel");
const { register, login, verifyToken } = require("./auth");
const supabase = require("./supabase");
const { analyzeSite } = require("./analyze");
const { generateBoards } = require("./boards");
const { generatePins } = require("./pins");

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("Нет токена");
    const decoded = verifyToken(authHeader);
    req.userId = decoded.userId;
    next();
  } catch (e) {
    res.status(401).json({ error: "Не авторизован" });
  }
}

function handleError(res, e, publicMessage) {
  console.error(e);
  res.status(400).json({ error: publicMessage || "Произошла ошибка, попробуйте ещё раз" });
}

app.get("/", (req, res) => {
  res.send("OK");
});

app.get("/test-text", requireAuth, async (req, res) => {
  try {
    const result = await generateText("Скажи привет одним словом");
    res.json({ result });
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/test-image", requireAuth, async (req, res) => {
  try {
    const model = req.query.model || "flux-schnell";
    const result = await generateImage("милый кот в стиле акварели", model);
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/list-models", requireAuth, async (req, res) => {
  try {
    const result = await listModels();
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/check-image/:id", requireAuth, async (req, res) => {
  try {
    const result = await checkImage(req.params.id);
    res.json(result);
  } catch (e) {
    handleError(res, e);
  }
});

app.post("/register", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await register(email, password);
    res.json(result);
  } catch (e) {
    handleError(res, e, e.message.includes("уже существует") ? e.message : undefined);
  }
});

app.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password);
    res.json(result);
  } catch (e) {
    handleError(res, e, "Неверный email или пароль");
  }
});

app.get("/me", requireAuth, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, credits_balance, subscription_tier")
      .eq("id", req.userId)
      .single();

    if (error || !user) throw new Error("Пользователь не найден");

    res.json(user);
  } catch (e) {
    handleError(res, e, "Пользователь не найден");
  }
});

app.post("/projects", requireAuth, async (req, res) => {
  try {
    const { website_url, niche, language, goal, tone } = req.body;
    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: req.userId, website_url, niche, language, goal, tone })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    handleError(res, e);
  }
});

app.get("/projects", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from("projects").select("*").eq("user_id", req.userId);
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
    if (error) throw error;
    res.json(data);
  } catch (e) {
    handleError(res, e, "Проект не найден");
  }
});

app.post("/projects/:id/analyze", requireAuth, async (req, res) => {
  try {
    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();

    if (fetchError || !project) throw new Error("Проект не найден");

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
    handleError(res, e, e.message === "Проект не найден" ? e.message : undefined);
  }
});

app.post("/projects/:id/boards/generate", requireAuth, async (req, res) => {
  try {
    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();
    if (fetchError || !project) throw new Error("Проект не найден");

    const ideas = await generateBoards(project);

    const rows = ideas.map((b) => ({
      project_id: project.id,
      title: b.title,
      description: b.description,
      status: "new",
    }));

    const { data: inserted, error: insertError } = await supabase.from("boards").insert(rows).select();
    if (insertError) throw insertError;

    res.json(inserted);
  } catch (e) {
    handleError(res, e, e.message === "Проект не найден" ? e.message : undefined);
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
    if (fetchError || !project) throw new Error("Проект не найден");

    const { data, error } = await supabase
      .from("boards")
      .select("*")
      .eq("project_id", req.params.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (e) {
    handleError(res, e, e.message === "Проект не найден" ? e.message : undefined);
  }
});

async function getBoardWithOwnerCheck(boardId, userId) {
  const { data: board, error } = await supabase
    .from("boards")
    .select("*, projects(user_id, niche, tone, goal)")
    .eq("id", boardId)
    .single();
  if (error || !board) throw new Error("Доска не найдена");
  if (board.projects.user_id !== userId) throw new Error("Доска не найдена");
  return board;
}

async function getPinWithOwnerCheck(pinId, userId) {
  const { data: pin, error } = await supabase
    .from("pins")
    .select("*, boards(id, title, description, projects(user_id, niche, tone))")
    .eq("id", pinId)
    .single();
  if (error || !pin) throw new Error("Пин не найден");
  if (pin.boards.projects.user_id !== userId) throw new Error("Пин не найден");
  return pin;
}

app.patch("/pins/:id", requireAuth, async (req, res) => {
  try {
    await getPinWithOwnerCheck(req.params.id, req.userId);
    const { title, description } = req.body;
    const { data, error } = await supabase
      .from("pins")
      .update({ title, description })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    handleError(res, e, "Пин не найден");
  }
});


app.post("/pins/:id/status", requireAuth, async (req, res) => {
  try {
    await getPinWithOwnerCheck(req.params.id, req.userId);
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status)) throw new Error("Некорректный статус");
    const { data, error } = await supabase
      .from("pins")
      .update({ status })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    handleError(res, e, "Пин не найден");
  }
});


app.post("/pins/:id/regenerate", requireAuth, async (req, res) => {
  try {
    const pin = await getPinWithOwnerCheck(req.params.id, req.userId);
    const instruction = req.body.instruction || "";
    const model = pin.model_used || "flux-schnell";

    const cost = Math.ceil((MODEL_PRICES[model] || 15) * MARKUP);
    const balance = await getBalance(req.userId);
    if (balance < cost) {
      return res.status(402).json({ error: "Недостаточно кредитов", required: cost, balance });
    }

    const prompt = `${pin.title}. ${pin.description}. ${instruction}`.trim();
    const image = await generateImage(prompt, model);

    await adjustBalance(req.userId, -cost, "regeneration", `Перегенерация пина (${model})`);

    const { data: updated, error } = await supabase
      .from("pins")
      .update({ image_url: image.url, credits_cost: cost })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;

    res.json(updated);
  } catch (e) {
    handleError(res, e, "Пин не найден");
  }
});


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
    handleError(res, e, "Доска не найдена");
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
    handleError(res, e, "Доска не найдена");
  }
});

app.post("/boards/:id/pins/generate", requireAuth, async (req, res) => {
  try {
    const board = await getBoardWithOwnerCheck(req.params.id, req.userId);
    const model = req.body.model || "flux-schnell";
    const count = Math.min(req.body.count || 6, 10);
    const aspectRatio = req.body.aspect_ratio || "mixed";
    const mixedRatios = Array.isArray(req.body.mixed_ratios) ? req.body.mixed_ratios : undefined;

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

    const markedUpPins = pinsData.map((p) => ({
      ...p,
      credits_cost: Math.ceil(p.credits_cost * MARKUP),
    }));
    const totalCharge = markedUpPins.reduce((sum, p) => sum + p.credits_cost, 0);

    await adjustBalance(req.userId, -totalCharge, "generation", `Генерация ${count} пинов (${model})`);

    const { data: inserted, error } = await supabase.from("pins").insert(markedUpPins).select();
    if (error) throw error;

    res.json(inserted);
  } catch (e) {
    handleError(res, e, "Доска не найдена");
  }
});


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


app.post("/credits/dev-topup", async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Этот эндпоинт недоступен в продакшене");
    }
    const { email, amount, adminSecret } = req.body;
    if (adminSecret !== process.env.ADMIN_SECRET) throw new Error("Не авторизован");

    const { data: user, error } = await supabase.from("users").select("id").eq("email", email).single();
    if (error || !user) throw new Error("Пользователь не найден");

    const newBalance = await adjustBalance(user.id, amount, "topup", "Тестовое пополнение");
    res.json({ balance: newBalance });
  } catch (e) {
    handleError(res, e);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});