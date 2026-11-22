const { logError, logWarning } = require("./safeLogger");
const bcrypt = require("bcryptjs");
const { signSessionToken, verifySessionToken } = require("./sessionToken");
const supabase = require("./supabase");
const { httpError, validateEmail, validatePassword } = require("./validate");

/**
 * Attach a stable machine-readable code to an error the client shows to a person. The
 * Russian message stays the default (older clients and logs rely on it); the code lets
 * the web client render the same failure in the user's own language.
 */
function withCode(error, code, defaults = {}) {
  error.details = { ...(error.details || {}), code, ...defaults };
  return error;
}
const emailVerify = require("./email-verify");
const loginLockout = require("./loginLockout");

// Точное сообщение для 403 при неподтверждённом email (ТЗ, п.3).
const MSG_NEED_VERIFY = "Подтвердите email — письмо отправлено повторно";

// Заглушка для сравнения пароля, когда пользователя нет —
// защита от тайминг-атак (ответ всегда одинаково долгий)
const DUMMY_HASH = bcrypt.hashSync("invalid-placeholder-password", 10);

// Регистрация: аккаунт создаётся НЕподтверждённым, JWT НЕ выдаётся.
// Вместо токена — письмо со ссылкой подтверждения (users.email_verified, миграция 005).
// Почтовый сбой не ломает регистрацию: письмо можно запросить повторно на /login
// или из кабинета (POST /resend-verification).
async function register(rawEmail, rawPassword, rawName, rawSurname, rawLanguage, termsAccepted) {
  // Раздел 164. Галочка согласия существовала только в браузере: `POST /register` принимал запрос
  // без неё, и сервер не знал, что клиент согласился с условиями. Согласие — юридический факт,
  // он должен требоваться на сервере и сохраняться, а не жить в состоянии React.
  if (termsAccepted !== true) {
    throw withCode(
      httpError(422, "Подтвердите согласие с условиями использования и политикой конфиденциальности"),
      "terms_not_accepted"
    );
  }
  const email = validateEmail(rawEmail);
  const password = validatePassword(rawPassword);

  const { data: existing, error: lookupError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) {
    logError("auth.event_001");
    throw httpError(503, "Не удалось проверить данные аккаунта — попробуйте позже");
  }
  if (existing) {
    throw withCode(httpError(409, "Пользователь с таким email уже существует"), "email_already_registered");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const profile = {
    preferred_language: require('./email-locales').normalizeLanguage(rawLanguage),
    // Момент согласия фиксируется на сервере: без него согласие невозможно доказать.
    terms_accepted_at: new Date().toISOString(),
  };
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
      /\b(name|surname|preferred_language|terms_accepted_at)\b/i.test(result.error.message || "");

    if (result.error.code === "23505") {
      throw withCode(httpError(409, "Пользователь с таким email уже существует"), "email_already_registered");
    }
    if (!missingOptionalColumn) {
      logError("auth.event_002");
      throw httpError(503, "Не удалось создать аккаунт — попробуйте позже");
    }

    // Consent is a required legal record, not an optional profile field. If migration 166
    // is missing, fail before creating an account; never silently discard the timestamp.
    if (/\bterms_accepted_at\b/i.test(result.error.message || "")) {
      logError("auth.event_003");
      throw httpError(503, "Регистрация временно недоступна — попробуйте позже");
    }

    // Older deployments may lack non-legal profile columns. Retry once without those fields,
    // but preserve the server-generated consent timestamp on every successful insert.
    result = await insertUser({
      email,
      password_hash: passwordHash,
      credits_balance: 0,
      terms_accepted_at: profile.terms_accepted_at,
    });
    if (result.error) {
      if (result.error.code === "23505") {
        throw withCode(httpError(409, "Пользователь с таким email уже существует"), "email_already_registered");
      }
      logError("auth.event_003");
      throw httpError(503, "Не удалось создать аккаунт — попробуйте позже");
    }
  }

  data = result.data;


  // Токен (sha256 в auth_tokens, purpose='email_verify', TTL 24 ч) + письмо.
  const sent = await emailVerify.issueVerificationToken(data);
  if (!sent) {
    logWarning("auth.event_004");
  }

  return {
    ok: true,
    needVerification: true,
    verificationEmailSent: sent,
    // Keep the user-facing claim aligned with the actual mail-provider result.
    message: sent
      ? "Аккаунт создан. Мы отправили письмо со ссылкой подтверждения на ваш email — перейдите по ней, чтобы войти."
      : "Аккаунт создан. Письмо со ссылкой подтверждения отправить сейчас не удалось — запросите его повторно на странице входа.",
    user: { id: data.id, email: data.email, email_verified: false, onboarded: false, tariff_plan: "none" },
  };
}

async function login(rawEmail, rawPassword) {
  const email = validateEmail(rawEmail);
  validatePassword(rawPassword); // единая проверка формата, чтобы не раскрывать наличие аккаунта

  // Durable lockout first: a locked account must not even reach the password comparison, so the
  // check cannot be used as a timing or response oracle and a distributed guess hits a real wall.
  const lock = await loginLockout.lockState(email);
  if (lock.locked) {
    throw loginLockout.lockedError(lock.retryAfterSeconds);
  }

  const { data: user, error: lookupError } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    logError("auth.event_005");
    throw httpError(503, "Сервис авторизации временно недоступен — попробуйте позже");
  }

  // Пароль проверяем ДО проверки email_verified: иначе по коду ответа (403 vs 401)
  // можно было бы отличить существующий неподтверждённый аккаунт от несуществующего.
  const isValid = await bcrypt.compare(rawPassword, user?.password_hash || DUMMY_HASH);
  if (!user || !isValid) {
    // Count the failure only when the address exists. The answer stays "invalid credentials":
    // telling an attacker that this attempt just locked the account would confirm the address.
    if (user) await loginLockout.recordFailure(email);
    throw withCode(httpError(401, "Неверный email или пароль"), "invalid_credentials");
  }

  // Correct password: the counter starts again from zero.
  await loginLockout.clearFailures(user.id);

  // Аккаунт в процессе удаления (миграция 127): вход запрещён. Колонки может
  // ещё не быть в схеме — тогда `undefined` и проверка пропускается, поэтому
  // деплой кода не ломает вход до применения миграции.
  if (user.account_status && user.account_status !== "active") {
    throw withCode(httpError(403, "Аккаунт удаляется — вход недоступен"), "account_pending_deletion");
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
    logWarning("auth.event_006");
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
