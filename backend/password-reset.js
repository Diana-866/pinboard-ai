const { logError, logInfo, logWarning } = require("./safeLogger");
// Сброс пароля: одноразовый токен по email (Этап 2.4).
// Требует: auth_tokens (см. db/migrations/002_auth_tokens.sql) и MAIL_* переменные окружения.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const supabase = require("./supabase");
const { httpError, validationError } = require("./validate");

// Машинный код к ошибке: без него клиент показывает русский текст в любой локали.
function withCode(error, code) {
  error.details = { ...(error.details || {}), code };
  return error;
}
const { getEmailCopy } = require("./email-locales");
const { transactionalMailConfigured, sendMail } = require("./mail");

const TTL_MINUTES = 60;
const RESEND_INTERVAL_SECONDS = 300; // не чаще одного письма восстановления за 5 минут на аккаунт

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

  const { data: user, error: lookupError } = await supabase
    .from("users")
    .select("id, preferred_language")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    logError("password-reset.event_006");
    throw withCode(
      httpError(503, "Сервис восстановления пароля временно недоступен — попробуйте позже"),
      "password_reset_unavailable"
    );
  }

  if (user && transactionalMailConfigured()) {
    const token = crypto.randomBytes(32).toString("base64url");
    const { data: issued, error } = await supabase.rpc("issue_password_reset_token", {
      p_user_id: String(user.id),
      p_token_hash: sha256(token),
      p_expires_at: new Date(Date.now() + TTL_MINUTES * 60 * 1000).toISOString(),
      p_min_interval_seconds: RESEND_INTERVAL_SECONDS,
    });
    if (error || issued !== true) {
      if (error) {
        logError("password-reset.event_005");
      } else {
        // Cooldown or missing user: intentionally identical public response.
        logInfo("password-reset.event_004");
      }
      // Не раскрываем существование аккаунта через различия ответов.
    } else {
      const base = (process.env.FRONTEND_URL || "https://pinposy.com")
        .split(",")[0].trim().replace(/\/$/, "");
      try {
        await sendResetEmail(
          email,
          `${base}/reset-password#token=${encodeURIComponent(token)}`,
          user.preferred_language || requestedLanguage
        );
      } catch (e) {
        logError("password-reset.event_003");
      }
    }
  } else if (user) {
    logWarning("password-reset.event_002");
  }

  return {
    ok: true,
    message: "Если такой email зарегистрирован, письмо со ссылкой уже отправлено. Проверьте почту.",
  };
}

// Смена пароля по одноразовому токену.
// Проверка токена, смена пароля и его погашение выполняются одной SQL-транзакцией
// (миграция 020), поэтому параллельные запросы не могут применить ссылку дважды.
async function applyReset(rawToken, rawPassword) {
  const { validatePassword } = require("./validate");
  const password = validatePassword(rawPassword);
  if (!rawToken || typeof rawToken !== "string" || rawToken.length > 512) {
    throw validationError("password_reset_link_invalid", "Ссылка недействительна");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase.rpc("consume_password_reset_token", {
    p_token_hash: sha256(rawToken),
    p_password_hash: passwordHash,
  });

  if (error) {
    logError("password-reset.event_001");
    throw withCode(
      httpError(500, "Не удалось обновить пароль — попробуйте позже"),
      "password_reset_unavailable"
    );
  }
  if (data !== true) {
    throw validationError(
      "password_reset_link_invalid",
      "Ссылка недействительна или устарела — запросите новую"
    );
  }

  return { ok: true, message: "Пароль изменён. Теперь войдите с новым паролем." };
}

module.exports = { requestReset, applyReset };
