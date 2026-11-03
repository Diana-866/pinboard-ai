const supabase = require("./supabase");
const { normalizePlan } = require("./tariff");

function monthKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function requireAdmin(req, res, next) {
  try {
    const { data: user, error } = await supabase.from("users").select("is_admin").eq("id", req.userId).single();
    if (error || !user || !user.is_admin) throw new Error("Доступ запрещён");
    next();
  } catch (e) {
    res.status(403).json({ error: "Доступ запрещён" });
  }
}

async function getStats() {
  // Тариф читается из актуального поля users.tariff_plan (legacy subscription_tier
  // больше не используется; нормализация алиасов — через backend/tariff.js).
  const { data: users, error: usersError } = await supabase.from("users").select("id, created_at, tariff_plan");
  if (usersError) throw usersError;

  const { data: transactions, error: txError } = await supabase
    .from("credit_transactions")
    .select("amount, type, created_at");
  if (txError) throw txError;

  const signupsByMonth = {};
  users.forEach((u) => {
    const key = monthKey(u.created_at);
    signupsByMonth[key] = (signupsByMonth[key] || 0) + 1;
  });

  const creditsSoldByMonth = {};
  const creditsSpentByMonth = {};
  transactions.forEach((t) => {
    const key = monthKey(t.created_at);
    if (t.amount > 0) {
      creditsSoldByMonth[key] = (creditsSoldByMonth[key] || 0) + Number(t.amount);
    } else {
      creditsSpentByMonth[key] = (creditsSpentByMonth[key] || 0) + Math.abs(Number(t.amount));
    }
  });

  // Разбивка пользователей по тарифам (digital-эквивалент
  // select tariff_plan, count(*) from users group by 1):
  const tariffPlanBreakdown = {};
  users.forEach((u) => {
    const plan = normalizePlan(u.tariff_plan);
    tariffPlanBreakdown[plan] = (tariffPlanBreakdown[plan] || 0) + 1;
  });

  return { totalUsers: users.length, signupsByMonth, tariffPlanBreakdown, creditsSoldByMonth, creditsSpentByMonth };
}

module.exports = { requireAdmin, getStats };