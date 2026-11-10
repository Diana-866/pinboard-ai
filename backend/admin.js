const supabase = require("./supabase");
const { normalizePlan } = require("./tariff");

const STATS_PAGE_SIZE = 500;

function monthKey(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchAllRows(db, table, columns, pageSize = STATS_PAGE_SIZE) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
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

async function getStats(db = supabase) {
  // Read every page: Supabase applies a row cap to each response by default.
  const [users, transactions] = await Promise.all([
    fetchAllRows(db, "users", "id, created_at, tariff_plan"),
    fetchAllRows(db, "credit_transactions", "amount, type, created_at"),
  ]);

  const signupsByMonth = {};
  users.forEach((u) => {
    const key = monthKey(u.created_at);
    if (key) signupsByMonth[key] = (signupsByMonth[key] || 0) + 1;
  });

  const creditsSoldByMonth = {};
  const creditsSpentByMonth = {};
  transactions.forEach((t) => {
    const key = monthKey(t.created_at);
    const amount = Number(t.amount);
    if (!key || !Number.isFinite(amount)) return;
    if (amount > 0) {
      creditsSoldByMonth[key] = (creditsSoldByMonth[key] || 0) + amount;
    } else if (amount < 0) {
      creditsSpentByMonth[key] = (creditsSpentByMonth[key] || 0) + Math.abs(amount);
    }
  });

  // This remains a count of cached tariff labels, not effective active entitlements.
  const tariffPlanBreakdown = {};
  users.forEach((u) => {
    const plan = normalizePlan(u.tariff_plan);
    tariffPlanBreakdown[plan] = (tariffPlanBreakdown[plan] || 0) + 1;
  });

  return { totalUsers: users.length, signupsByMonth, tariffPlanBreakdown, creditsSoldByMonth, creditsSpentByMonth };
}

module.exports = { requireAdmin, getStats, monthKey, fetchAllRows };
