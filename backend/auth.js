const bcrypt = require("bcryptjs");
const { signSessionToken, verifySessionToken } = require("./sessionToken");
const supabase = require("./supabase");
const { httpError, validateEmail, validatePassword } = require("./validate");
const emailVerify = require("./email-verify");

// Точное сообщение для 403 при неподтверждённом email (ТЗ, п.3).
const MSG_NEED_VERIFY = "Подтвердите email — письмо отправлено повторно";

// Заглушка для сравнения пароля, когда пользователя нет —
// защита от тайминг-атак (ответ всегда одинаково долгий)
const DUMMY_HASH = bcrypt.hashSync("invalid-placeholder-password", 10);

// Регистрация: аккаунт создаётся НЕподтверждённым, JWT НЕ выдаётся.
// Вместо токена — письмо со ссылкой подтверждения (users.email_verified, миграция 005).
// Почтовый сбой не ломает регистрацию: письмо можно запросить повторно на /login
// или из кабинета (POST /resend-verification).
async function register(rawEmail, rawPassword, rawName, rawSurname, rawLanguage) {
  const email = validateEmail(rawEmail);
  const password = validatePassword(rawPassword);

  const { data: existing, error: lookupError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) {
    console.error("[register] не удалось проверить email:", lookupError.message);
    throw httpError(503, "Не удалось проверить данные аккаунта — попробуйте позже");
  }
  if (existing) {
    throw httpError(409, "Пользователь с таким email уже существует");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const profile = { preferred_language: require('./email-locales').normalizeLanguage(rawLanguage) };
  if ((rawName || "").trim()) profile.name = rawName.trim().slice(0, 80);
  if ((rawSurname || "").trim()) profile.surname = rawSurname.trim().slice(0, 80);

  // Backward compatibility: retry without optional profile columns ONLY when
  // Postgres/PostgREST explicitly reports one of those columns missing.
  // Never retry arbitrary failures (e.g. duplicate email or DB outage) as a
  // second insert, because that can hide the real error or create partial state.
  let data;
  const insertUser = (row) => supabase
    .from("users")
    .insert(row)
    .select()
    .single();

  let result = await insertUser({
    email,
    password_hash: passwordHash,
    credits_balance: 0,
    ...profile,
  });

  if (result.error) {
    const missingOptionalColumn =
      ["42703", "PGRST204"].includes(result.error.code) &&
      /\b(name|surname|preferred_language)\b/i.test(result.error.message || "");

    if (result.error.code === "23505") {
      throw httpError(409, "Пользователь с таким email уже существует");
    }
    if (!missingOptionalColumn) {
      console.error("[register] не удалось создать аккаунт:", result.error.message);
      throw httpError(503, "Не удалось создать аккаунт — попробуйте позже");
    }

    result = await insertUser({
      email,
      password_hash: passwordHash,
      credits_balance: 0,
    });
    if (result.error) {
      if (result.error.code === "23505") {
        throw httpError(409, "Пользователь с таким email уже существует");
      }
      console.error("[register] резервное создание аккаунта не выполнено:", result.error.message);
      throw httpError(503, "Не удалось создать аккаунт — попробуйте позже");
    }
  }

  data = result.data;


  // Токен (sha256 в auth_tokens, purpose='email_verify', TTL 24 ч) + письмо.
  const sent = await emailVerify.issueVerificationToken(data);
  if (!sent) {
    console.warn(
      "[register] письмо подтверждения не отправлено — пользователь сможет запросить повторно"
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

  const { data: user, error: lookupError } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    console.error("[login] не удалось получить аккаунт:", lookupError.message);
    throw httpError(503, "Сервис авторизации временно недоступен — попробуйте позже");
  }

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

  const token = signSessionToken(user, process.env.JWT_SECRET);
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
  return verifySessionToken(token, process.env.JWT_SECRET);
}

module.exports = { register, login, verifyToken, MSG_NEED_VERIFY };
