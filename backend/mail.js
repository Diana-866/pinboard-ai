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

function getReplySmtpConfig() {
  const port = Number(process.env.MAIL_REPLY_SMTP_PORT || 465);
  return {
    host: process.env.MAIL_REPLY_SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
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
    port: Number(process.env.MAIL_IMAP_PORT || 993),
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
  const port = Number(process.env.MAIL_SMTP_PORT || 465);
  return {
    host: process.env.MAIL_SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
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
  listInbox,
  fetchMessageBody,
  replyToMessage,
  mailConfigured,
  transactionalMailConfigured,
  sendMail,
  buildTransactionalTransportOptions,
  buildReplyTransportOptions,
  buildImapClientOptions,
  MAIL_IMAP_CONNECTION_TIMEOUT_MS,
  MAIL_IMAP_GREETING_TIMEOUT_MS,
  MAIL_IMAP_SOCKET_TIMEOUT_MS,
  MAIL_CONNECTION_TIMEOUT_MS,
  MAIL_GREETING_TIMEOUT_MS,
  MAIL_SOCKET_TIMEOUT_MS,
};
