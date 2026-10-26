const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("./supabase");
const { httpError, validateEmail, validatePassword } = require("./validate");
const emailVerify = require("./email-verify");

const TOKEN_TTL = "7d";

// Заглушка для сравнения пароля, когда пользователя нет —
// защита от тайминг-атак (ответ всегда одинаково долгий)
const DUMMY_HASH = bcrypt.hashSync("invalid-placeholder-password", 10);

// Регистрация: аккаунт создаётся НЕподтверждённым, JWT не выдаётся.
// Вместо токена — письмо со ссылкой подтверждения (миграция 005: users.email_verified).
// Почтовый сбой не ломает регистрацию: письмо можно запросить повторно на /login.
async function register(rawEmail, rawPassword, rawName, rawSurname) {
  const email = validateEmail(rawEmail);
  const password = validatePassword(rawPassword);

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    throw httpError(409, "Пользователь с таким email уже существует");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const profile = {};
  if ((rawName || '').trim()) profile.name = rawName.trim().slice(0, 80);
  if ((rawSurname || '').trim()) profile.surname = rawSurname.trim().slice(0, 80);

  // Если миграция 003 (колонки name/surname) ещё не применена — регистрируем без профиля
  let data, error;
  try {
    ({ data, error } = await supabase
      .from("users")
      .insert({ email, password_hash: passwordHash, credits_balance: 0, ...profile })
      .select()
      .single());
    if (error) throw error;
  } catch (eCol) {
    ({ data, error } = await supabase
      .from("users")
      .insert({ email, password_hash: passwordHash, credits_balance: 0 })
      .select()
      .single());
  }
  if (error) throw new Error(error.message);

  // Письмо со ссылкой подтверждения (TTL 24 часа). Регистрация успешна и без письма,
  // но войти пользователь сможет только после подтверждения — письмо высылается повторно на /login.
  const sent = await emailVerify.issueVerificationToken(data);
  if (!sent) {
    console.warn(`[register] письмо подтверждения не отправлено для ${email} — пользователь сможет запросить повторно`);
  }

  return {
    ok: true,
    needVerification: true,
    message:
      "Аккаунт создан. Мы отправили письмо со ссылкой подтверждения на ваш email — перейдите по ней, чтобы войти.",
    user: { id: data.id, email: data.email, onboarded: false, tariff_plan: "none" },
  };
}

async function login(rawEmail, rawPassword) {
  const email = validateEmail(rawEmail);
  validatePassword(rawPassword); // единая проверка формата, чтобы не раскрывать наличие аккаунта

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  const isValid = await bcrypt.compare(rawPassword, user?.password_hash || DUMMY_HASH);
  if (!user || !isValid) {
    throw httpError(401, "Неверный email или пароль");
  }

  // Email не подтверждён: вход запрещён, письмо высылаем повторно
  // (не чаще раза в 5 минут — троттлинг по последнему email_verify токену).
  // Строгая проверка === false: если миграция 005 ещё не применена, колонки нет —
  // не блокируем всех подряд, а просто предупреждаем в лог (как с 003/004 выше).
  if (user.email_verified === false) {
    const allowed = await emailVerify.canResend(user.id);
    if (allowed) {
      await emailVerify.issueVerificationToken(user);
    }
    throw httpError(
      403,
      allowed
        ? "Подтвердите email — письмо отправлено повторно"
        : "Подтвердите email — письмо уже отправлено, повторная отправка будет доступна через несколько минут"
    );
  }
  if (user.email_verified == null) {
    console.warn("[login] users.email_verified отсутствует — примените миграцию 005 (вход без подтверждения)");
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      credits_balance: user.credits_balance,
      onboarded: user.onboarded ?? false,
      tariff_plan: user.tariff_plan ?? "none",
    },
  };
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { register, login, verifyToken };
