// Сброс пароля: одноразовый токен по email (Этап 2.4).
// Требует: auth_tokens (см. db/migrations/002_auth_tokens.sql) и MAIL_* переменные окружения.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const supabase = require("./supabase");
const { httpError } = require("./validate");
const { getEmailCopy } = require("./email-locales");
const { transactionalMailConfigured, sendMail } = require("./mail");

const TTL_MINUTES = 60;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function sendResetEmail(to, resetUrl, language = "en") {
  const copy = getEmailCopy(language);
  return sendMail({
    to,
    subject: copy.resetSubject,
    text: [copy.hello, "", copy.resetLead, copy.resetLink, resetUrl, "", copy.resetIgnore, "", copy.team].join("\n"),
  });
}

// Просьба сброса: ответ всегда одинаковый (не раскрываем, есть ли такой email).
// frontendUrl оставлен в сигнатуре для совместимости, но публичному запросу не доверяем.
async function requestReset(rawEmail, _frontendUrl, requestedLanguage) {
  const { validateEmail } = require("./validate");
  const email = validateEmail(rawEmail);

  const { data: user } = await supabase
    .from("users")
    .select("id, preferred_language")
    .eq("email", email)
    .maybeSingle();

  if (user && transactionalMailConfigured()) {
    const token = crypto.randomBytes(32).toString("base64url");
    const { error } = await supabase.from("auth_tokens").insert({
      user_id: String(user.id),
      token_hash: sha256(token),
      purpose: "password_reset",
      expires_at: new Date(Date.now() + TTL_MINUTES * 60 * 1000).toISOString(),
    });
    if (error) {
      console.error("[password-reset] не удалось создать токен:", error.message);
      // Не раскрываем существование аккаунта через различия ответов.
    } else {
      const base = (process.env.FRONTEND_URL || "https://pinposy.com")
        .split(",")[0].trim().replace(/\/$/, "");
      try {
        await sendResetEmail(
          email,
          `${base}/reset-password?token=${encodeURIComponent(token)}`,
          user.preferred_language || requestedLanguage
        );
      } catch (e) {
        console.error("[password-reset] письмо не отправлено:", e.message);
      }
    }
  } else if (user) {
    console.warn("[password-reset] транзакционная почта не настроена");
  }

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
