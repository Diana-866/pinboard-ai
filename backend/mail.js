const crypto = require("node:crypto");
const { logWarning, logError } = require("./safeLogger");
// Почтовый модуль админки: чтение входящих (IMAP) и ответы (SMTP).
// Включается переменными окружения:
//   IMAP: MAIL_IMAP_HOST, MAIL_IMAP_PORT, MAIL_IMAP_USER, MAIL_IMAP_PASS
//   Ответы поддержки: MAIL_REPLY_SMTP_HOST, MAIL_REPLY_SMTP_PORT,
//     MAIL_REPLY_SMTP_USER, MAIL_REPLY_SMTP_PASS, MAIL_REPLY_FROM
//   Транзакционные письма: MAIL_SMTP_HOST, MAIL_SMTP_PORT,
//     MAIL_SMTP_USER, MAIL_SMTP_PASS, MAIL_FROM
// MAIL_USER/MAIL_PASS остаются fallback только для IMAP/ответов поддержки; транзакционная почта требует отдельные MAIL_SMTP_*.

const { httpError } = require("./validate");
const { normalizeInboxLimit, normalizeImapUid, normalizeSupportReply } = require("./mailInputValidation");

/**
 * Раздел 155. Переменная, заполненная заглушкой, выглядит заполненной: `MAIL_SMTP_HOST=smtp.<provider>`
 * имеет длину 15 символов, проходит любую проверку «не пусто» и падает только в момент отправки письма,
 * оставляя в журнале безымянный `email-verify.event_004`. Владелец при этом видит «письмо не пришло».
 *
 * Поэтому заглушки распознаются явно и по имени: угловые скобки, слова-маркеры, повторяющиеся символы.
 */
const MAIL_PLACEHOLDER_MARKERS = ["<", ">", "provider", "example", "changeme", "change_me", "your-", "yoursmtp", "xxx", "placeholder", "todo"];

const EMAIL_SHAPE = /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/;

function looksLikePlaceholder(value) {
  const text = String(value == null ? "" : value).trim().toLowerCase();
  if (!text) return true;
  // Угловые скобки бывают двумя разными вещами: `PinPosy <support@pinposy.com>` — настоящий
  // отправитель с отображаемым именем, а `smtp.<provider>` — заглушка. Различаем по содержимому.
  const angled = text.match(/<([^>]*)>/);
  if (angled) {
    const inside = angled[1].trim();
    return !EMAIL_SHAPE.test(inside) || MAIL_PLACEHOLDER_MARKERS.some((m) => m !== "<" && m !== ">" && inside.includes(m));
  }
  return MAIL_PLACEHOLDER_MARKERS.some((marker) => text.includes(marker));
}

/** Имена почтовых переменных, которые заполнены заглушкой. Пустой список — конфигурация правдоподобна. */
function unresolvedMailPlaceholders(env = process.env) {
  const names = ["MAIL_SMTP_HOST", "MAIL_SMTP_USER", "MAIL_SMTP_PASS", "MAIL_FROM"];
  if (env && env.MAIL_HTTP_API_KEY && looksLikePlaceholder(env.MAIL_HTTP_API_KEY)) {
    names.push("MAIL_HTTP_API_KEY");
  }
  return names.filter((name) => looksLikePlaceholder(env && env[name]));
}

function getImapAuth() {
  return {
    user: process.env.MAIL_IMAP_USER || process.env.MAIL_USER,
    pass: process.env.MAIL_IMAP_PASS || process.env.MAIL_PASS,
  };
}

function getTransactionalSmtpAuth(env = process.env) {
  return {
    user: env.MAIL_SMTP_USER || "",
    pass: env.MAIL_SMTP_PASS || "",
  };
}

/**
 * Port number from the environment, or the fallback when the variable is absent.
 *
 * A value the mail server cannot use must be refused here rather than turned into `NaN` or
 * silently replaced by the default: `Number("0") || 465` used to send mail to a port nobody
 * configured, and `Number("abc")` failed later inside the transport with a message that names
 * neither the variable nor the reason.
 */
function mailPort(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const port = Number(String(raw).trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    logError("mail.event_005");
    throw httpError(503, "Отправка писем временно недоступна. Попробуйте позже.");
  }
  return port;
}

/**
 * Encryption policy, derived from the port only where the protocol fixes it.
 *
 * 465 is implicit TLS. Every other port must negotiate STARTTLS explicitly: nodemailer has no
 * "refuse to authenticate without TLS" switch, so `requireTLS: false` means a server - or a
 * network path that strips the STARTTLS advertisement - receives AUTH PLAIN and the message
 * body in cleartext. The previous rule (`requireTLS: port === 587`) did exactly that for every
 * port other than 465 and 587, for example 25, 2525 or a provider-specific one.
 */
function smtpTlsPolicy(port) {
  const secure = port === 465;
  return { secure, requireTLS: !secure };
}

function getReplySmtpConfig() {
  const port = mailPort(process.env.MAIL_REPLY_SMTP_PORT, 465);
  return {
    host: process.env.MAIL_REPLY_SMTP_HOST,
    port,
    ...smtpTlsPolicy(port),
    auth: {
      user: process.env.MAIL_REPLY_SMTP_USER || process.env.MAIL_USER,
      pass: process.env.MAIL_REPLY_SMTP_PASS || process.env.MAIL_PASS,
    },
    from: process.env.MAIL_REPLY_FROM || process.env.MAIL_REPLY_SMTP_USER || process.env.MAIL_USER,
  };
}

function mailConfigured() {
  const auth = getImapAuth();
  return !!(process.env.MAIL_IMAP_HOST && auth.user && auth.pass);
}

function transactionalMailConfigured(env = process.env) {
  const auth = getTransactionalSmtpAuth(env);
  return !!(env.MAIL_SMTP_HOST && auth.user && auth.pass);
}

const MAIL_HTTP_API_DEFAULT_URL = "https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json";
const MAIL_HTTP_API_ALLOWED_HOSTS = new Set(["goapi.unisender.ru", "go1.unisender.ru", "go2.unisender.ru"]);
const MAIL_HTTP_API_PATH = "/ru/transactional/api/v1/email/send.json";
const MAIL_HTTP_API_TIMEOUT_MS = 10_000;

function parseHttpApiFrom(env = process.env) {
  const raw = String(env.MAIL_HTTP_API_FROM || env.MAIL_FROM || env.MAIL_SMTP_USER || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(.*?)\s*<([^<>]+)>$/);
  const email = (match ? match[2] : raw).trim();
  if (!EMAIL_SHAPE.test(email)) return null;
  const name = String(env.MAIL_HTTP_API_FROM_NAME || (match && match[1]) || "PinPosy")
    .replace(/[\r\n]+/g, " ")
    .replace(/^["']|["']$/g, "")
    .trim()
    .slice(0, 78) || "PinPosy";
  return { email, name };
}

function transactionalHttpMailConfigured(env = process.env) {
  const apiKey = String(env.MAIL_HTTP_API_KEY || "").trim();
  return !!(apiKey && !looksLikePlaceholder(apiKey) && parseHttpApiFrom(env));
}

function getHttpApiMailConfig(env = process.env) {
  const apiKey = String(env.MAIL_HTTP_API_KEY || "").trim();
  const from = parseHttpApiFrom(env);
  if (!apiKey || !from) return null;

  const rawUrl = String(env.MAIL_HTTP_API_URL || MAIL_HTTP_API_DEFAULT_URL).trim();
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    const error = new Error("Invalid transactional HTTP mail endpoint");
    error.code = "config_mail_http_api_url_invalid";
    error.providerStatus = 503;
    throw error;
  }
  if (url.protocol !== "https:" || !MAIL_HTTP_API_ALLOWED_HOSTS.has(url.hostname) ||
      url.pathname !== MAIL_HTTP_API_PATH || url.search || url.hash || url.username || url.password) {
    const error = new Error("Transactional HTTP mail endpoint is not an allowed HTTPS endpoint");
    error.code = "config_mail_http_api_url_invalid";
    error.providerStatus = 503;
    throw error;
  }
  return { url: url.toString(), apiKey, from };
}

/**
 * Only connection-stage SMTP failures are safe to fall back from. A timeout during DATA/after
 * acceptance is ambiguous and must not trigger a second provider send.
 */
function isSmtpConnectFailure(error) {
  const code = String(error && error.code || "").toUpperCase();
  const command = String(error && error.command || "").toUpperCase();
  const connectionCodes = new Set(["ECONNECTION", "ECONNREFUSED", "ETIMEDOUT", "ESOCKET", "ENOTFOUND", "EHOSTUNREACH"]);
  if (!connectionCodes.has(code)) return false;
  if (command === "CONN" || command === "CONNECT") return true;
  return ["ECONNECTION", "ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH"].includes(code);
}

function parseSingleRecipient(to) {
  const raw = String(to || "").trim();
  const match = raw.match(/<([^<>]+)>/);
  const email = (match ? match[1] : raw).trim();
  if (raw.includes(",") || raw.includes(";") || !EMAIL_SHAPE.test(email)) {
    throw new Error("Transactional HTTP mail requires one valid recipient");
  }
  return email;
}

async function sendTransactionalHttpApi({ to, subject, text, html, messageId }, { env = process.env, axiosClient } = {}) {
  const config = getHttpApiMailConfig(env);
  if (!config) throw new Error("Transactional HTTP mail is not configured");
  const recipient = parseSingleRecipient(to);
  const message = {
    recipients: [{ email: recipient }],
    from_email: config.from.email,
    from_name: config.from.name,
    subject: String(subject || ""),
    body: {
      ...(typeof text === "string" && text ? { plaintext: text } : {}),
      ...(typeof html === "string" && html ? { html } : {}),
    },
    track_links: 0,
    track_read: 0,
  };
  // Unisender Go may require support to enable idempotence_key for the account.
  // Send it only after the owner confirms that feature is enabled.
  if (String(env.MAIL_HTTP_API_IDEMPOTENCE_ENABLED || "").toLowerCase() === "true") {
    message.idempotence_key = typeof messageId === "string" && messageId.trim()
      ? crypto.createHash("sha256").update(messageId).digest("hex")
      : crypto.randomUUID();
  }
  if (!message.body.plaintext && !message.body.html) {
    throw new Error("Transactional HTTP mail requires a text or HTML body");
  }

  const axios = axiosClient || require("axios");
  let response;
  try {
    response = await axios.post(config.url, { message }, {
      timeout: MAIL_HTTP_API_TIMEOUT_MS,
      headers: {
        "X-API-KEY": config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      validateStatus: () => true,
    });
  } catch (error) {
    if (error && Number.isInteger(error.response && error.response.status)) {
      error.providerStatus = error.response.status;
    } else if (error && !Number.isInteger(error.providerStatus)) {
      error.providerStatus = 502;
    }
    throw error;
  }

  const status = Number(response && response.status);
  const data = response && response.data;
  const failedEmails = data && data.failed_emails;
  const recipientFailed = failedEmails && Object.prototype.hasOwnProperty.call(failedEmails, recipient);
  if (status < 200 || status >= 300 || !data || data.status !== "success" || recipientFailed) {
    const error = new Error("Transactional HTTP mail provider rejected the message");
    error.providerStatus = status >= 400 && status <= 599 ? status : 502;
    error.code = Number.isSafeInteger(data && data.code) ? "mail_http_api_rejected" : "mail_http_api_failed";
    throw error;
  }
  return { ok: true };
}

async function sendMailViaHttpApi(message, { needThrow = true, env = process.env, axiosClient } = {}) {
  try {
    await sendTransactionalHttpApi(message, { env, axiosClient });
    return { ok: true };
  } catch (error) {
    logError("mail.http_api_failed", error, Number.isInteger(error && error.providerStatus) ? error.providerStatus : 503);
    if (!needThrow) return { ok: false, error: "Отправка писем временно недоступна. Попробуйте позже." };
    throw httpError(503, "Отправка писем временно недоступна. Попробуйте позже.");
  }
}

async function listInbox(limit = 30) {
  const safeLimit = normalizeInboxLimit(limit);
  if (!mailConfigured()) {
    logError("mail.event_005");
    throw httpError(503, "Почтовый ящик временно недоступен. Попробуйте позже.");
  }
  const { ImapFlow } = require("imapflow");
  const client = new ImapFlow(buildImapClientOptions());

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    const messages = [];
    try {
      // Bound the requested page. ImapFlow exposes mailbox.exists after the lock;
      // retain a compatibility fallback for servers without that metadata.
      let total = Number(client.mailbox && client.mailbox.exists);
      if (!Number.isSafeInteger(total) || total < 0) {
        total = 0;
        for await (const msg of client.fetch({ all: true }, { envelope: true, flags: true }, { uid: true })) {
          total++;
        }
      }
      // An empty mailbox has no message 0, so "1:*" is an invalid sequence range that some
      // servers reject - the admin inbox page would answer 500 instead of "no messages".
      const startUid = Math.max(1, total - safeLimit + 1);
      if (total > 0) {
        for await (const msg of client.fetch({ seq: `${startUid}:*` }, { envelope: true, flags: true }, { uid: true })) {
          messages.push({
            uid: msg.uid,
            from: msg.envelope?.from
              ?.map((a) => (a.name ? `${a.name} <${a.address || ""}>` : String(a.address || "")))
              .filter(Boolean)
              .join(", ") || "",
            subject: msg.envelope?.subject || "(без темы)",
            date: msg.envelope?.date || null,
            seen: (msg.flags || []).has ? (msg.flags).has("\\Seen") : false,
          });
        }
      }
    } finally {
      lock.release();
    }
    messages.reverse(); // свежие сверху
    return messages;
  } finally {
    await client.logout().catch(() => {});
  }
}

async function fetchMessageBody(uid) {
  const safeUid = normalizeImapUid(uid);
  if (!mailConfigured()) {
    logError("mail.event_005");
    throw httpError(503, "Почтовый ящик временно недоступен. Попробуйте позже.");
  }
  const { ImapFlow } = require("imapflow");
  const client = new ImapFlow(buildImapClientOptions());
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const msg = await client.fetchOne(safeUid, { bodyStructure: true, source: true }, { uid: true });
      if (!msg) throw httpError(404, "Письмо не найдено");
      let body = "";
      const walk = (node) => {
        if (!node) return;
        if (node.childNodes) return node.childNodes.forEach(walk);
        if (node.type === "text" && (node.encoding || "").toLowerCase() !== "base64") {
          const text = node.source ? node.source.toString("utf8") : "";
          if (text) body += text + "\n";
        }
      };
      walk(msg.bodyStructure);
      if (!body && msg.source) body = msg.source.toString("utf8").replace(/<[^>]+>/g, " ").slice(0, 8000);
      return { uid: Number(safeUid), body: body.slice(0, 8000) };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

async function replyToMessage(to, subject, text) {
  const reply = normalizeSupportReply(to, subject, text);
  const config = getReplySmtpConfig();
  if (!config.host || !config.auth.user || !config.auth.pass) {
    logError("mail.event_004");
    throw httpError(503, "Ответы поддержки временно недоступны. Попробуйте позже.");
  }
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport(buildReplyTransportOptions(config));

  await transporter.sendMail({
    from: config.from,
    to: reply.to,
    // Normalize rather than test one spelling: mail clients send RE:, re: and Re:, and a
    // case-sensitive check turned "RE: Refund" into "Re: RE: Refund".
    subject: `Re: ${reply.subject.replace(/^re:\s*/i, "")}`,
    text: reply.text,
  });
  return { ok: true };
}

const MAIL_CONNECTION_TIMEOUT_MS = 10_000;
const MAIL_GREETING_TIMEOUT_MS = 10_000;
const MAIL_SOCKET_TIMEOUT_MS = 30_000;

/**
 * Параметры транспорта. Таймауты обязательны: значения по умолчанию у nodemailer доходят
 * до десяти минут, и зависший SMTP держал бы запрос регистрации или сброса пароля открытым
 * намного дольше, чем клиент готов ждать.
 */
const MAIL_IMAP_CONNECTION_TIMEOUT_MS = 10_000;
const MAIL_IMAP_GREETING_TIMEOUT_MS = 10_000;
const MAIL_IMAP_SOCKET_TIMEOUT_MS = 60_000;

/**
 * Параметры IMAP-клиента. Без них действуют значения imapflow (сокет — 5 минут), и
 * зависший почтовый сервер держал бы админский запрос почти всё это время.
 */
function buildImapClientOptions() {
  return {
    host: process.env.MAIL_IMAP_HOST,
    port: mailPort(process.env.MAIL_IMAP_PORT, 993),
    secure: true,
    auth: getImapAuth(),
    logger: false,
    connectionTimeout: MAIL_IMAP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: MAIL_IMAP_GREETING_TIMEOUT_MS,
    socketTimeout: MAIL_IMAP_SOCKET_TIMEOUT_MS,
  };
}

function mailTransportTimeouts() {
  return {
    connectionTimeout: MAIL_CONNECTION_TIMEOUT_MS,
    greetingTimeout: MAIL_GREETING_TIMEOUT_MS,
    socketTimeout: MAIL_SOCKET_TIMEOUT_MS,
  };
}

/** Параметры транспорта для ответов поддержки: те же таймауты, что и у транзакционной почты. */
function buildReplyTransportOptions(config) {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: config.auth,
    ...mailTransportTimeouts(),
  };
}

function buildTransactionalTransportOptions(env = process.env) {
  const port = mailPort(env.MAIL_SMTP_PORT, 465);
  return {
    host: env.MAIL_SMTP_HOST,
    port,
    ...smtpTlsPolicy(port),
    auth: getTransactionalSmtpAuth(env),
    ...mailTransportTimeouts(),
  };
}

// Универсальная отправка письма (используется биллингом: «Тариф активирован»).
// Не бросает исключение наружу без needThrow — вызывающий код сам решает, критично ли это.
async function sendMail({ to, subject, text, html, messageId }, { needThrow = true, env = process.env, httpApiClient } = {}) {
  const message = { to, subject, text, html, messageId };
  if (!transactionalMailConfigured(env)) {
    if (transactionalHttpMailConfigured(env)) return sendMailViaHttpApi(message, { needThrow, env, axiosClient: httpApiClient });
    if (!needThrow) {
      logWarning("mail.event_002");
      return { ok: false, skipped: true };
    }
    logError("mail.event_003");
    throw httpError(503, "Отправка писем временно недоступна. Попробуйте позже.");
  }

  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport(buildTransactionalTransportOptions(env));
  try {
    await transporter.sendMail({
      from: env.MAIL_FROM || getTransactionalSmtpAuth(env).user,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      ...(messageId ? { messageId } : {}),
    });
    return { ok: true };
  } catch (error) {
    if (transactionalHttpMailConfigured(env) && isSmtpConnectFailure(error)) {
      logWarning("mail.smtp_http_fallback", error, 503);
      return sendMailViaHttpApi(message, { needThrow, env, axiosClient: httpApiClient });
    }
    if (!needThrow) {
      logError("mail.event_001");
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

module.exports = {
  unresolvedMailPlaceholders,
  looksLikePlaceholder,
  listInbox,
  fetchMessageBody,
  replyToMessage,
  mailConfigured,
  transactionalMailConfigured,
  transactionalHttpMailConfigured,
  getHttpApiMailConfig,
  isSmtpConnectFailure,
  sendTransactionalHttpApi,
  sendMailViaHttpApi,
  sendMail,
  buildTransactionalTransportOptions,
  buildReplyTransportOptions,
  getReplySmtpConfig,
  buildImapClientOptions,
  MAIL_IMAP_CONNECTION_TIMEOUT_MS,
  MAIL_IMAP_GREETING_TIMEOUT_MS,
  MAIL_IMAP_SOCKET_TIMEOUT_MS,
  MAIL_CONNECTION_TIMEOUT_MS,
  MAIL_GREETING_TIMEOUT_MS,
  MAIL_SOCKET_TIMEOUT_MS,
  MAIL_HTTP_API_DEFAULT_URL,
  MAIL_HTTP_API_TIMEOUT_MS,
};
