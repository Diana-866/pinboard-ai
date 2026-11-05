// Почтовый модуль админки: чтение входящих (IMAP) и ответы (SMTP).
// Включается переменными окружения:
//   IMAP: MAIL_IMAP_HOST, MAIL_IMAP_PORT, MAIL_IMAP_USER, MAIL_IMAP_PASS
//   Ответы поддержки: MAIL_REPLY_SMTP_HOST, MAIL_REPLY_SMTP_PORT,
//     MAIL_REPLY_SMTP_USER, MAIL_REPLY_SMTP_PASS, MAIL_REPLY_FROM
//   Транзакционные письма: MAIL_SMTP_HOST, MAIL_SMTP_PORT,
//     MAIL_SMTP_USER, MAIL_SMTP_PASS, MAIL_FROM
// MAIL_USER/MAIL_PASS остаются fallback для старой конфигурации.

const { httpError } = require("./validate");

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
  if (!mailConfigured()) {
    throw httpError(503, "Почта не настроена: задайте MAIL_IMAP_HOST, MAIL_IMAP_USER и MAIL_IMAP_PASS на сервере");
  }
  const { ImapFlow } = require("imapflow");
  const client = new ImapFlow({
    host: process.env.MAIL_IMAP_HOST,
    port: Number(process.env.MAIL_IMAP_PORT || 993),
    secure: true,
    auth: getImapAuth(),
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    const messages = [];
    try {
      // Последние `limit` писем: собираем uid'ы и читаем с конца
      let count = 0;
      for await (const msg of client.fetch({ all: true }, { envelope: true, flags: true }, { uid: true })) {
        count++;
      }
      const total = count;
      const startUid = Math.max(1, total - limit + 1);
      let idx = 0;
      for await (const msg of client.fetch({ seq: `${startUid}:*` }, { envelope: true, flags: true }, { uid: true })) {
        idx++;
        messages.push({
          uid: msg.uid,
          from: msg.envelope?.from?.map((a) => `${a.name || ""} <${a.address || ""}>`).join(", ") || "",
          subject: msg.envelope?.subject || "(без темы)",
          date: msg.envelope?.date || null,
          seen: (msg.flags || []).has ? (msg.flags).has("\\Seen") : false,
        });
      }
      void total;
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
  if (!mailConfigured()) {
    throw httpError(503, "Почта не настроена: задайте MAIL_IMAP_HOST, MAIL_IMAP_USER и MAIL_IMAP_PASS на сервере");
  }
  const { ImapFlow } = require("imapflow");
  const client = new ImapFlow({
    host: process.env.MAIL_IMAP_HOST,
    port: Number(process.env.MAIL_IMAP_PORT || 993),
    secure: true,
    auth: getImapAuth(),
    logger: false,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const msg = await client.fetchOne(String(uid), { bodyStructure: true, source: true }, { uid: true });
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
      return { uid: Number(uid), body: body.slice(0, 8000) };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

async function replyToMessage(to, subject, text) {
  const config = getReplySmtpConfig();
  if (!config.host || !config.auth.user || !config.auth.pass) {
    throw httpError(503, "SMTP ответов поддержки не настроен: задайте MAIL_REPLY_SMTP_HOST, MAIL_REPLY_SMTP_USER и MAIL_REPLY_SMTP_PASS");
  }
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: config.auth,
  });

  await transporter.sendMail({
    from: config.from,
    to,
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    text,
  });
  return { ok: true };
}

// Универсальная отправка письма (используется биллингом: «Тариф активирован»).
// Не бросает исключение наружу без needThrow — вызывающий код сам решает, критично ли это.
async function sendMail({ to, subject, text, html }, { needThrow = true } = {}) {
  if (!transactionalMailConfigured()) {
    if (!needThrow) {
      console.warn("[mail] SMTP не настроен — письмо не отправлено:", subject);
      return { ok: false, skipped: true };
    }
    throw httpError(503, "Транзакционная почта не настроена: задайте MAIL_SMTP_HOST, MAIL_SMTP_USER и MAIL_SMTP_PASS на сервере");
  }
  const nodemailer = require("nodemailer");
  const port = Number(process.env.MAIL_SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: getTransactionalSmtpAuth(),
  });

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || getTransactionalSmtpAuth().user,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    });
    return { ok: true };
  } catch (e) {
    if (!needThrow) {
      console.error("[mail] письмо не отправлено:", e.message);
      return { ok: false, error: e.message };
    }
    throw e;
  }
}

module.exports = { listInbox, fetchMessageBody, replyToMessage, mailConfigured, transactionalMailConfigured, sendMail };
