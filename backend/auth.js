const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("./supabase");
const { httpError, validateEmail, validatePassword } = require("./validate");
const emailVerify = require("./email-verify");

const TOKEN_TTL = "7d";

// Точное сообщение для 403 при неподтверждённом email (ТЗ, п.3).
const MSG_NEED_VERIFY = "Подтвердите email — письмо отправлено повторно";

// Заглушка для сравнения пароля, когда пользователя нет —
// защита от тайминг-атак (ответ всегда одинаково долгий)
const DUMMY_HASH = bcrypt.hashSync("invalid-placeholder-password", 10);

// Регистрация: аккаунт создаётся НЕподтверждённым, JWT НЕ выдаётся.
// Вместо токена — письмо со ссылкой подтверждения (users.email_verified, миграция 005).
// Почтовый сбой не ломает регистрацию: письмо можно запросить повторно на /login
// или из кабинета (POST /resend-verification).
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
  if ((rawName || "").trim()) profile.name = rawName.trim().slice(0, 80);
  if ((rawSurname || "").trim()) profile.surname = rawSurname.trim().slice(0, 80);

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

  // Токен (sha256 в auth_tokens, purpose='email_verify', TTL 24 ч) + письмо.
  const sent = await emailVerify.issueVerificationToken(data);
  if (!sent) {
    console.warn(
      `[register] письмо подтверждения не отправлено для ${email} — пользователь сможет запросить повторно`
    );
  }

  return {
    ok: true,
    needVerification: true,
    verificationEmailSent: sent,
    message:
      "Аккаунт создан. Мы отправили письмо со ссылкой подтверждения на ваш email — перейдите по ней, чтобы войти.",
    user: { id: data.id, email: data.email, email_verified: false, onboarded: false, tariff_plan: "none" },
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

  // Пароль проверяем ДО проверки email_verified: иначе по коду ответа (403 vs 401)
  // можно было бы отличить существующий неподтверждённый аккаунт от несуществующего.
  const isValid = await bcrypt.compare(rawPassword, user?.password_hash || DUMMY_HASH);
  if (!user || !isValid) {
    throw httpError(401, "Неверный email или пароль");
  }

  // Email не подтверждён: вход запрещён (JWT не выдаём), письмо высылаем повторно —
  // не чаще раза в 5 минут (троттлинг по последнему email_verify-токену).
  // Строгая проверка === false: если миграция 005 ещё не применена, колонки нет —
  // не блокируем всех подряд, только предупреждаем в лог.
  if (user.email_verified === false) {
    const wait = await emailVerify.secondsUntilResend(user.id);
    let emailSent = false;
    if (wait === 0) {
      emailSent = await emailVerify.issueVerificationToken(user);
    }
    const err = httpError(403, MSG_NEED_VERIFY);
    err.details = {
      code: "email_not_verified",
      emailSent,
      retryAfterSeconds: wait,
      email: user.email,
    };
    throw err;
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
      email_verified: user.email_verified !== false,
      onboarded: user.onboarded ?? false,
      tariff_plan: user.tariff_plan ?? "none",
    },
  };
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { register, login, verifyToken, MSG_NEED_VERIFY };
