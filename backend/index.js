const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const { generateText, generateImage, listModels, checkImage } = require("./gptunnel");
const { register, login, verifyToken } = require("./auth");
const supabase = require("./supabase");
const { analyzeSite } = require("./analyze");

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

app.get("/", (req, res) => {
  res.send("OK");
});

app.get("/test-text", async (req, res) => {
  try {
    const result = await generateText("Скажи привет одним словом");
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/test-image", async (req, res) => {
  try {
    const result = await generateImage("милый кот в стиле акварели");
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/list-models", async (req, res) => {
  try {
    const result = await listModels();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/check-image/:id", async (req, res) => {
  try {
    const result = await checkImage(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await register(email, password);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
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
    res.status(401).json({ error: e.message });
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
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/projects", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from("projects").select("*").eq("user_id", req.userId);
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
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
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
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

    if (updateError) throw new Error(updateError.message);

    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
