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
  return names.filter((name) => looksLikePlaceholder(env && env[name]));
}

function getImapAuth() {
  return {
    user: process.env.MAIL_IMAP_USER || process.env.MAIL_USER,
    pass: process.env.MAIL_IMAP_PASS || process.env.MAIL_PASS,
  };
}

function getTransactionalSmtpAuth() {
  return {
    user: process.env.MAIL_SMTP_USER,
    pass: process.env.MAIL_SMTP_PASS,
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

function transactionalMailConfigured() {
  const auth = getTransactionalSmtpAuth();
  return !!(process.env.MAIL_SMTP_HOST && auth.user && auth.pass);
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

function buildTransactionalTransportOptions() {
  const port = mailPort(process.env.MAIL_SMTP_PORT, 465);
  return {
    host: process.env.MAIL_SMTP_HOST,
    port,
    ...smtpTlsPolicy(port),
    auth: getTransactionalSmtpAuth(),
    ...mailTransportTimeouts(),
  };
}

// Универсальная отправка письма (используется биллингом: «Тариф активирован»).
// Не бросает исключение наружу без needThrow — вызывающий код сам решает, критично ли это.
async function sendMail({ to, subject, text, html, messageId }, { needThrow = true } = {}) {
  if (!transactionalMailConfigured()) {
    if (!needThrow) {
      logWarning("mail.event_002");
      return { ok: false, skipped: true };
    }
    logError("mail.event_003");
    throw httpError(503, "Отправка писем временно недоступна. Попробуйте позже.");
  }
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport(buildTransactionalTransportOptions());

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || getTransactionalSmtpAuth().user,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      ...(messageId ? { messageId } : {}),
    });
    return { ok: true };
  } catch (e) {
    if (!needThrow) {
      logError("mail.event_001");
      return { ok: false, error: e.message };
    }
    throw e;
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
};
