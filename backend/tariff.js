const { logError } = require("./safeLogger");
// Тарифные «замочки» на уровне API (а не только в UI).
// Правило продукта:
//   none / analytics — только аналитика, генерация запрещена;
//   start / pro / agency — генерация разрешена.
// Тариф считается активным, только пока не истёк оплаченный период (subscriptions.period_end).

const supabase = require("./supabase");
const { httpError } = require("./validate");

// Совместимость: в ранней версии миграции 004 тариф назывался 'standard',
// миграция переименовала его в 'pro'. Алиас оставлен, чтобы код и старые записи не падали.
const ALIASES = { standard: "pro", free: "none", "" : "none" };

// Тарифы, которые открывают генерацию
const GENERATION_PLANS = ["start", "pro", "agency"];

function normalizePlan(plan) {
  const p = String(plan || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ALIASES, p)) return ALIASES[p];
  return p || "none";
}

/**
 * Активна ли подписка пользователя.
 * Возвращает { plan, active, periodEnd }.
 * Логика:
 *  1. Берём users.tariff_plan и users.tariff_period_end (быстрый путь для /me и UI).
 *  2. Уточняем по последней success-подписке: если period_end в прошлом — тариф истёк.
 *  3. Если строки подписок нет вовсе (тариф выставлен вручную админом) — доверяем users.
 */
async function getTariffState(userId, db = supabase) {
  const { data: user, error } = await db
    .from("users")
    .select("tariff_plan, tariff_period_end")
    .eq("id", userId)
    .single();

  if (error || !user) throw httpError(404, "Пользователь не найден");

  const cachedPlan = normalizePlan(user.tariff_plan);

  // Always consult paid subscriptions, even when the denormalized user cache
  // says "none". A stale cache must not hide a successfully paid entitlement.
  const { data: sub, error: subscriptionError } = await db
    .from("subscriptions")
    .select("plan, status, period_end")
    .eq("user_id", String(userId))
    .eq("status", "success")
    // Migration 019 defines the newest-created paid order as the current plan.
    // period_end can be later on an older order whose webhook arrived late.
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A failed subscription lookup is not the same as no subscription.
  // Fail closed so a transient database error cannot grant paid access.
  if (subscriptionError) throw subscriptionError;

  if (!sub) {
    const plan = cachedPlan;
    // Подписки нет — доверяем ручной выдаче тарифа, но всё равно соблюдаем
    // срок, если администратор задал tariff_period_end. Null означает бессрочную выдачу.
    const periodEnd = user.tariff_period_end || null;
    const active = plan !== "none" && (!periodEnd || new Date(periodEnd).getTime() > Date.now());
    return { plan, active, periodEnd };
  }

  const plan = normalizePlan(sub.plan || cachedPlan);
  // The user period end is the accumulated entitlement horizon. A late older
  // webhook can have a later per-order period_end without owning the current plan.
  const periodEnd = user.tariff_period_end || sub.period_end || null;
  // A successful paid order must have a finite entitlement horizon. NULL is
  // valid only for an explicit manual grant (the no-subscription branch above),
  // never as an accidental permanent paid subscription.
  const active = plan !== "none" && !!periodEnd && new Date(periodEnd).getTime() > Date.now();
  return { plan, active, periodEnd };
}

/**
 * Middleware: доступ только с указанными тарифами и только пока период не истёк.
 *   app.post("/boards/:id/pins/generate", requireAuth, requireTariff(), ...)
 *   requireTariff(["standard", "pro"])  // алиас standard → pro
 */
function requireTariff(plans = GENERATION_PLANS) {
  const allowed = (Array.isArray(plans) ? plans : [plans]).map(normalizePlan);

  return async function tariffGuard(req, res, next) {
    try {
      const state = await getTariffState(req.userId);
      if (!state.active) {
        return res.status(403).json({
          error: "Подписка не активна — оформите тариф, чтобы пользоваться генерацией",
          code: "tariff_required",
          required_plans: allowed,
          current_plan: state.plan,
          period_end: state.periodEnd,
          upgrade_url: "/pricing",
        });
      }
      if (!allowed.includes(state.plan)) {
        return res.status(403).json({
          error:
            state.plan === "analytics"
              ? "Тариф «Аналитика» не включает генерацию — перейдите на «Старт» или выше"
              : "Этот раздел недоступен на вашем тарифе",
          code: "tariff_insufficient",
          required_plans: allowed,
          current_plan: state.plan,
          period_end: state.periodEnd,
          upgrade_url: "/pricing",
        });
      }
      req.tariff = state;
      next();
    } catch (e) {
      logError("tariff.event_001", "[requireTariff]", e && e.message);
      res.status(500).json({ error: "Не удалось проверить тариф" });
    }
  };
}

module.exports = { requireTariff, getTariffState, normalizePlan, GENERATION_PLANS };
