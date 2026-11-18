const supabase = require("./supabase");
const { normalizePlan } = require("./tariff");
const { fetchAllPages } = require("./fetchAllPages");

const STATS_PAGE_SIZE = 500;
const STATS_MAX_ROWS = 100000;

function monthKey(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchAllRows(db, table, columns, pageSize = STATS_PAGE_SIZE, maxRows = STATS_MAX_ROWS) {
  return fetchAllPages((from, to) => db
    .from(table)
    .select(columns)
    // Stable unique ordering is required before offset pagination. These
    // inventory tables use UUID primary keys; without ORDER BY, rows can be
    // skipped or repeated between pages and distort financial/admin totals.
    .order("id", { ascending: true })
    .range(from, to), { pageSize, maxRows });
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
