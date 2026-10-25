// Сброс пароля: одноразовый токен по email (Этап 2.4).
// Требует: auth_tokens (см. db/migrations/002_auth_tokens.sql) и MAIL_* переменные окружения.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const supabase = require("./supabase");
const { httpError } = require("./validate");

const TTL_MINUTES = 60;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function mailConfigured() {
  return !!(process.env.MAIL_SMTP_HOST && process.env.MAIL_USER && process.env.MAIL_PASS);
}

async function sendResetEmail(to, resetUrl) {
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
    subject: "PinPosy — восстановление пароля",
    text: `Здравствуйте!\n\nВы запросили восстановление пароля PinPosy.\nСсылка для смены пароля (действует ${TTL_MINUTES} минут, одноразовая):\n${resetUrl}\n\nЕсли вы не запрашивали сброс — просто проигнорируйте это письмо, пароль не изменится.\n\n— команда PinPosy`,
  });
}

// Просьба сброса: ответ всегда одинаковый (не раскрываем, есть ли такой email)
async function requestReset(rawEmail, frontendUrl) {
  const { validateEmail } = require("./validate");
  const email = validateEmail(rawEmail);

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    const { error } = await supabase.from("auth_tokens").insert({
      user_id: String(user.id),
      token_hash: sha256(token),
      purpose: "password_reset",
      expires_at: new Date(Date.now() + TTL_MINUTES * 60 * 1000).toISOString(),
    });
    if (error) throw httpError(500, "Не удалось создать ссылку восстановления");

    if (mailConfigured()) {
      const base = frontendUrl || process.env.FRONTEND_URL || "https://pinposy.com";
      try {
        await sendResetEmail(email, `${base}/reset-password?token=${token}`);
      } catch (e) {
        console.error("[password-reset] письмо не отправлено:", e.message);
        throw httpError(503, "Почтовый сервис не отвечает — попробуйте позже");
      }
    } else {
      console.warn("[password-reset] MAIL_* не заданы — ссылка не отправлена");
      throw httpError(503, "Восстановление по email пока не настроено — напишите на support@pinposy.com");
    }
  }
  // Одинаковый ответ для существующих и несуществующих адресов — защита от перебора
  return {
    ok: true,
    message: "Если такой email зарегистрирован, письмо со ссылкой уже отправлено. Проверьте почту.",
  };
}

// Смена пароля по одноразовому токену
async function applyReset(rawToken, rawPassword) {
  const { validatePassword } = require("./validate");
  const password = validatePassword(rawPassword);
  if (!rawToken || typeof rawToken !== "string") throw httpError(422, "Ссылка недействительна");

  const { data: row } = await supabase
    .from("auth_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", sha256(rawToken))
    .eq("purpose", "password_reset")
    .maybeSingle();

  // Одинаковый ответ и для просроченного, и для использованного, и для выдуманного токена
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
    throw httpError(422, "Ссылка недействительна или устарела — запросите новую");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { error: updErr } = await supabase
    .from("users")
    .update({ password_hash: passwordHash })
    .eq("id", row.user_id);
  if (updErr) throw httpError(500, "Не удалось обновить пароль — попробуйте позже");

  await supabase.from("auth_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true, message: "Пароль изменён. Теперь войдите с новым паролем." };
}

module.exports = { requestReset, applyReset };
