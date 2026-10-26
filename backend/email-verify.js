// Подтверждение email при регистрации (миграция 005: users.email_verified).
// Паттерн токенов — как в password-reset.js: случайный токен пользователю,
// sha256-хэш в auth_tokens (purpose='email_verify'), TTL 24 часа.

const crypto = require("crypto");
const supabase = require("./supabase");
const { httpError } = require("./validate");

const TTL_HOURS = 24;
const RESEND_INTERVAL_MINUTES = 5; // повторная отправка не чаще раза в 5 минут

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function mailConfigured() {
  return !!(process.env.MAIL_SMTP_HOST && process.env.MAIL_USER && process.env.MAIL_PASS);
}

async function sendVerifyEmail(to, verifyUrl) {
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_SMTP_HOST,
    port: Number(process.env.MAIL_SMTP_PORT || 465),
    secure: Number(process.env.MAIL_SMTP_PORT || 465) === 465,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject: "PinPosy — подтвердите email",
    text: `Здравствуйте!\n\nПодтвердите ваш email, чтобы войти в PinPosy.\nСсылка для подтверждения (действует ${TTL_HOURS} часа, одноразовая):\n${verifyUrl}\n\nЕсли вы не регистрировались в PinPosy — просто проигнорируйте это письмо.\n\n— команда PinPosy`,
  });
}

// Троттлинг повторной отправки: смотрим created_at последнего email_verify токена.
// Возвращает true, если письмо можно отправить (прошло >= 5 минут или токенов ещё не было).
async function canResend(userId) {
  const { data: rows } = await supabase
    .from("auth_tokens")
    .select("created_at")
    .eq("user_id", String(userId))
    .eq("purpose", "email_verify")
    .order("created_at", { ascending: false })
    .limit(1);

  const last = rows && rows[0];
  if (!last || !last.created_at) return true;
  return Date.now() - new Date(last.created_at).getTime() >= RESEND_INTERVAL_MINUTES * 60 * 1000;
}

// Создаёт email_verify-токен и отправляет письмо. Возвращает true, если письмо ушло.
// Не бросает исключений, если SMTP не настроен/упал — регистрация и вход не должны
// падать из-за почты (письмо можно запросить повторно на /login или из кабинета).
async function issueVerificationToken(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  const { error } = await supabase.from("auth_tokens").insert({
    user_id: String(user.id),
    token_hash: sha256(token),
    purpose: "email_verify",
    expires_at: new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000).toISOString(),
  });
  if (error) {
    console.error("[email-verify] не удалось создать токен:", error.message);
    return false;
  }

  if (!mailConfigured()) {
    console.warn("[email-verify] MAIL_* не заданы — письмо не отправлено");
    return false;
  }

  const base = process.env.FRONTEND_URL || "https://pinposy.com";
  try {
    await sendVerifyEmail(user.email, `${base}/verify-email?token=${token}`);
    return true;
  } catch (e) {
    console.error("[email-verify] письмо не отправлено:", e.message);
    return false;
  }
}

// Публичная повторная отправка. Два режима:
//  - по Authorization-заголовку (кабинет): отвечаем честно — это сам пользователь;
//  - по email из тела (страница входа): ответ всегда одинаковый, чтобы эндпоинт
//    нельзя было использовать для проверки существования email.
async function resendVerification(rawEmail, userIdFromToken) {
  if (userIdFromToken) {
    const { data: user } = await supabase
      .from("users")
      .select("id, email, email_verified")
      .eq("id", userIdFromToken)
      .maybeSingle();

    if (user && user.email_verified) {
      return { ok: true, message: "Email уже подтверждён." };
    }
    if (user) {
      const allowed = await canResend(user.id);
      if (!allowed) {
        return {
          ok: true,
          throttled: true,
          message: `Письмо уже отправлено — повторная отправка возможна через ${RESEND_INTERVAL_MINUTES} минут.`,
        };
      }
      const sent = await issueVerificationToken(user);
      return {
        ok: true,
        sent,
        message: sent
          ? "Письмо отправлено. Проверьте почту (и папку «Спам»)."
          : "Не удалось отправить письмо — попробуйте позже.",
      };
    }
    // пользователь по токену не найден — падаем в анонимный режим ниже
  }

  if (rawEmail) {
    const { validateEmail } = require("./validate");
    const email = validateEmail(rawEmail);
    const { data: user } = await supabase
      .from("users")
      .select("id, email, email_verified")
      .eq("email", email)
      .maybeSingle();

    if (user && !user.email_verified) {
      const allowed = await canResend(user.id);
      if (allowed) await issueVerificationToken(user);
    }
  }
  // Одинаковый ответ для всех — не раскрываем, есть ли такой email
  return {
    ok: true,
    message:
      "Если такой email зарегистрирован и ещё не подтверждён, письмо отправлено. Проверьте почту.",
  };
}

// Проверка токена из ссылки: помечаем email_verified=true и токен использованным.
// Ошибки одинаково непонятные — просроченный, использованный и выдуманный
// токены для клиента неразличимы.
async function applyVerification(rawToken) {
  if (!rawToken || typeof rawToken !== "string") {
    throw httpError(422, "Ссылка недействительна");
  }

  const { data: row } = await supabase
    .from("auth_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", sha256(rawToken))
    .eq("purpose", "email_verify")
    .maybeSingle();

  if (!row || new Date(row.expires_at) < new Date()) {
    throw httpError(422, "Ссылка недействительна или устарела — запросите новое письмо");
  }

  if (row.used_at) {
    // Ссылку уже открывали (иногда её префетчит почтовый сканер раньше человека).
    // Если email уже подтверждён — считаем успехом, чтобы человек не видел ошибку.
    const { data: u } = await supabase
      .from("users")
      .select("email_verified")
      .eq("id", row.user_id)
      .maybeSingle();
    if (u && u.email_verified === true) return { ok: true, already: true };
    throw httpError(422, "Ссылка недействительна или устарела — запросите новое письмо");
  }

  const { error: updErr } = await supabase
    .from("users")
    .update({ email_verified: true })
    .eq("id", row.user_id);
  if (updErr) {
    console.error("[email-verify] не удалось обновить users:", updErr.message);
    throw httpError(500, "Не удалось подтвердить email — попробуйте позже (проверьте, что миграция 005 применена)");
  }

  await supabase.from("auth_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true };
}

module.exports = {
  sha256,
  TTL_HOURS,
  RESEND_INTERVAL_MINUTES,
  canResend,
  issueVerificationToken,
  resendVerification,
  applyVerification,
};
