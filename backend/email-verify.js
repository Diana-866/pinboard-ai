// Подтверждение email при регистрации (миграция 005: users.email_verified).
//
// Паттерн токенов — ровно как в password-reset.js:
//   • клиенту уходит случайный токен (32 байта, base64url) только в ссылке письма;
//   • в БД лежит лишь sha256-хэш (token_hash, unique);
//   • purpose='email_verify', TTL 24 часа, одноразовое использование (used_at).
// Дополнительно: при выпуске нового токена все прежние неиспользованные
// email_verify-токены пользователя гасятся — активна всегда одна ссылка.

const crypto = require("crypto");
const supabase = require("./supabase");
const { httpError } = require("./validate");
const { getEmailCopy, normalizeLanguage } = require("./email-locales");
const { transactionalMailConfigured, sendMail } = require("./mail");

const TTL_HOURS = 24;
const RESEND_INTERVAL_MINUTES = 5; // повторная отправка не чаще раза в 5 минут
const PURPOSE = "email_verify";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}



// Письмо: текстовая часть (для всех клиентов) + HTML с кнопкой.
// Ссылка — единственное место, где живёт «сырой» токен.
async function sendVerifyEmail(to, verifyUrl, language = "en") {
  const copy = getEmailCopy(language);
  const text = [copy.hello, "", copy.verifyLead, copy.verifyExpiry, verifyUrl, "", copy.verifyIgnore, "", copy.team].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">
    <h2>${copy.verifyTitle}</h2><p>${copy.hello} ${copy.verifyLead}</p>
    <p><a href="${verifyUrl}" style="display:inline-block;background:#C25E6F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700">${copy.verifyButton}</a></p>
    <p style="font-size:12px;color:#6b7280">${copy.verifyExpiry}<br><span style="word-break:break-all">${verifyUrl}</span></p>
    <p style="font-size:12px;color:#6b7280">${copy.verifyIgnore}</p></div>`;
  return sendMail({ to, subject: copy.verifySubject, text, html });
}

// Время создания последнего email_verify-токена пользователя (мс) или null.
async function lastSentAt(userId) {
  const { data: rows } = await supabase
    .from("auth_tokens")
    .select("created_at")
    .eq("user_id", String(userId))
    .eq("purpose", PURPOSE)
    .order("created_at", { ascending: false })
    .limit(1);

  const last = rows && rows[0];
  if (!last || !last.created_at) return null;
  const ts = new Date(last.created_at).getTime();
  return Number.isFinite(ts) ? ts : null;
}

// Сколько секунд осталось до разрешённой повторной отправки (0 — можно слать).
async function secondsUntilResend(userId) {
  const last = await lastSentAt(userId);
  if (last === null) return 0;
  const waitMs = RESEND_INTERVAL_MINUTES * 60 * 1000 - (Date.now() - last);
  return waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
}

// true — письмо можно отправить (прошло >= 5 минут или токенов ещё не было).
async function canResend(userId) {
  return (await secondsUntilResend(userId)) === 0;
}

// Гасит все неиспользованные email_verify-токены пользователя.
// Нужно, чтобы в ящике не оставалось нескольких живых ссылок.
async function revokeUnused(userId) {
  const { error } = await supabase
    .from("auth_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", String(userId))
    .eq("purpose", PURPOSE)
    .is("used_at", null);
  if (error) {
    // не критично: старая ссылка просто останется действительной до TTL
    console.warn("[email-verify] не удалось погасить прежние токены:", error.message);
  }
}

// Создаёт email_verify-токен (TTL 24 часа) и отправляет письмо.
// Возвращает true, если письмо реально ушло. Исключений не бросает:
// регистрация и вход не должны падать из-за почты — письмо можно запросить повторно.
async function issueVerificationToken(user) {
  user.preferred_language = normalizeLanguage(user.preferred_language);
  await revokeUnused(user.id);

  const token = crypto.randomBytes(32).toString("base64url");
  const { error } = await supabase.from("auth_tokens").insert({
    user_id: String(user.id),
    token_hash: sha256(token),
    purpose: PURPOSE,
    expires_at: new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000).toISOString(),
  });
  if (error) {
    console.error("[email-verify] не удалось создать токен:", error.message);
    return false;
  }

  if (!transactionalMailConfigured()) {
    console.warn("[email-verify] транзакционная почта не настроена — письмо не отправлено");
    return false;
  }

  const base = (process.env.FRONTEND_URL || "https://pinposy.com").split(",")[0].trim();
  try {
    await sendVerifyEmail(user.email, `${base}/verify-email?token=${encodeURIComponent(token)}`, user.preferred_language);
    console.log("[email-verify] письмо подтверждения отправлено");
    return true;
  } catch (e) {
    console.error("[email-verify] письмо не отправлено:", e.message);
    return false;
  }
}

function pluralMinutes(sec) {
  const m = Math.max(1, Math.ceil(sec / 60));
  return `${m} мин`;
}

// Публичная повторная отправка. Два режима:
//  - по Authorization-заголовку (кабинет): отвечаем честно — это сам пользователь
//    (именно этот режим использует кнопка «Отправить письмо снова»);
//  - по email из тела (страница входа): ответ всегда одинаковый, чтобы эндпоинт
//    нельзя было использовать для проверки существования email.
async function resendVerification(rawEmail, userIdFromToken) {
  if (userIdFromToken) {
    const { data: user } = await supabase
      .from("users")
      .select("id, email, email_verified, preferred_language")
      .eq("id", userIdFromToken)
      .maybeSingle();

    if (user && user.email_verified === true) {
      return { ok: true, alreadyVerified: true, message: "Email уже подтверждён." };
    }
    if (user) {
      const wait = await secondsUntilResend(user.id);
      if (wait > 0) {
        return {
          ok: true,
          throttled: true,
          retryAfterSeconds: wait,
          message: `Письмо уже отправлено — повторная отправка возможна через ${pluralMinutes(wait)}.`,
        };
      }
      const sent = await issueVerificationToken(user);
      return {
        ok: true,
        sent,
        message: sent
          ? "Письмо отправлено. Проверьте почту (и папку «Спам»)."
          : "Не удалось отправить письмо — попробуйте позже или напишите на support@pinposy.com.",
      };
    }
    // пользователь по токену не найден — падаем в анонимный режим ниже
  }

  if (rawEmail) {
    const { validateEmail } = require("./validate");
    const email = validateEmail(rawEmail);
    const { data: user } = await supabase
      .from("users")
      .select("id, email, email_verified, preferred_language")
      .eq("email", email)
      .maybeSingle();

    // Троттлинг работает и для анонимного режима: чаще раза в 5 минут письмо не уходит
    if (user && user.email_verified !== true && (await canResend(user.id))) {
      await issueVerificationToken(user);
    }
  }
  // Одинаковый ответ для всех — не раскрываем, есть ли такой email
  return {
    ok: true,
    message:
      "Если такой email зарегистрирован и ещё не подтверждён, письмо отправлено. Проверьте почту.",
  };
}

// Проверка токена из ссылки: users.email_verified=true + токен помечен использованным.
// Ошибки одинаково неинформативны — просроченный, использованный и выдуманный
// токены для клиента неразличимы.
async function applyVerification(rawToken) {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length > 512) {
    throw httpError(422, "Ссылка недействительна");
  }

  // Atomic DB function locks the user and token, then updates both in one transaction.
  const { data, error } = await supabase.rpc("consume_email_verification_token", {
    p_token_hash: sha256(rawToken),
  });
  if (error) {
    console.error("[email-verify] атомарное подтверждение не выполнено:", error.message);
    throw httpError(500, "Не удалось подтвердить email — попробуйте позже");
  }
  if (data !== true) {
    throw httpError(422, "Ссылка недействительна или устарела — запросите новое письмо");
  }
  return { ok: true };
}

module.exports = {
  sha256,
  TTL_HOURS,
  RESEND_INTERVAL_MINUTES,
  canResend,
  secondsUntilResend,
  issueVerificationToken,
  resendVerification,
  applyVerification,
};
