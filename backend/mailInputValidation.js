"use strict";

const { httpError, validateEmail } = require("./validate");

function normalizeInboxLimit(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return 30;
  return Math.min(100, Math.max(1, parsed));
}

function normalizeImapUid(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!/^\d{1,12}$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
    throw httpError(422, "Некорректный UID письма");
  }
  return String(Number(raw));
}

function normalizeSupportReply(to, subject, text) {
  const recipient = validateEmail(to);
  if (typeof subject !== "string" || typeof text !== "string") {
    throw httpError(422, "Нужны корректные поля to, subject, text");
  }
  const normalizedSubject = subject.trim();
  const normalizedText = text.trim();
  if (
    !normalizedSubject ||
    normalizedSubject.length > 200 ||
    /[\r\n]/.test(normalizedSubject) ||
    !normalizedText ||
    normalizedText.length > 20000
  ) {
    throw httpError(422, "Тема должна быть до 200 символов, текст — до 20 000 символов");
  }
  return { to: recipient, subject: normalizedSubject, text: normalizedText };
}

module.exports = { normalizeInboxLimit, normalizeImapUid, normalizeSupportReply };
