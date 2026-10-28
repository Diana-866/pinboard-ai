// Почтовый модуль админки: чтение входящих (IMAP) и ответы (SMTP).
// Включается переменными окружения:
//   MAIL_IMAP_HOST, MAIL_IMAP_PORT, MAIL_USER, MAIL_PASS
//   MAIL_SMTP_HOST, MAIL_SMTP_PORT (опц.), MAIL_FROM (опц., по умолчанию MAIL_USER)
// Если MAIL_* не заданы — эндпоинты отвечают 503 с понятным сообщением.

const { httpError } = require("./validate");

function mailConfigured() {
  return !!(process.env.MAIL_IMAP_HOST && process.env.MAIL_USER && process.env.MAIL_PASS);
}

async function listInbox(limit = 30) {
  if (!mailConfigured()) {
    throw httpError(503, "Почта не настроена: задайте MAIL_IMAP_HOST, MAIL_USER, MAIL_PASS на сервере");
  }
  const { ImapFlow } = require("imapflow");
  const client = new ImapFlow({
    host: process.env.MAIL_IMAP_HOST,
    port: Number(process.env.MAIL_IMAP_PORT || 993),
    secure: true,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
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
    throw httpError(503, "Почта не настроена: задайте MAIL_IMAP_HOST, MAIL_USER, MAIL_PASS на сервере");
  }
  const { ImapFlow } = require("imapflow");
  const client = new ImapFlow({
    host: process.env.MAIL_IMAP_HOST,
    port: Number(process.env.MAIL_IMAP_PORT || 993),
    secure: true,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
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
  if (!process.env.MAIL_SMTP_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
    throw httpError(503, "SMTP не настроен: задайте MAIL_SMTP_HOST, MAIL_USER, MAIL_PASS на сервере");
  }
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
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    text,
  });
  return { ok: true };
}

// Универсальная отправка письма (используется биллингом: «Тариф активирован»).
// Не бросает исключение наружу без needThrow — вызывающий код сам решает, критично ли это.
async function sendMail({ to, subject, text }, { needThrow = true } = {}) {
  if (!process.env.MAIL_SMTP_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
    if (!needThrow) {
      console.warn("[mail] SMTP не настроен — письмо не отправлено:", subject);
      return { ok: false, skipped: true };
    }
    throw httpError(503, "SMTP не настроен: задайте MAIL_SMTP_HOST, MAIL_USER, MAIL_PASS на сервере");
  }
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_SMTP_HOST,
    port: Number(process.env.MAIL_SMTP_PORT || 465),
    secure: Number(process.env.MAIL_SMTP_PORT || 465) === 465,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to,
      subject,
      text,
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

module.exports = { listInbox, fetchMessageBody, replyToMessage, mailConfigured, sendMail };
