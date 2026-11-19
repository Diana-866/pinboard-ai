// Простая серверная валидация входных данных (без внешних зависимостей).
// Ошибки валидации бросаются с httpStatus — индекс/роуты отдают их клиенту как есть.

function httpError(status, message) {
  const e = new Error(message);
  e.httpStatus = status;
  return e;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail(raw) {
  if (typeof raw !== "string") throw httpError(422, "Укажите email");
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254 || !EMAIL_RE.test(email)) {
    throw httpError(422, "Введите корректный email");
  }
  // The regex cannot see an empty domain label: "a@b..c" satisfies it. Such an address can never
  // receive mail, so accepting it would create an account that can never be verified.
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (domain.split(".").some((label) => label.length === 0 || label.length > 63)) {
    throw httpError(422, "Введите корректный email");
  }
  return email;
}

function validatePassword(raw) {
  if (typeof raw !== "string" || raw.length < 8 || raw.length > 128) {
    throw httpError(422, "Пароль должен содержать от 8 до 128 символов");
  }
  return raw;
}

function optionalString(raw, { max = 500 } = {}) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw httpError(422, "Некорректный формат строки");
  const v = raw.trim();
  if (!v) return null;
  return v.slice(0, max);
}

function validateUrl(raw, { name = "URL сайта" } = {}) {
  if (typeof raw !== "string" || !raw.trim()) throw httpError(422, `${name}: укажите адрес`);
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    throw httpError(422, `${name}: некорректный адрес`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw httpError(422, `${name}: адрес должен начинаться с http:// или https://`);
  }
  return u.toString();
}

function validateEnum(raw, list, def, name = "Значение") {
  if ((raw === undefined || raw === null || raw === "") && def !== undefined) return def;
  if (!list.includes(raw)) {
    throw httpError(422, `${name}: допустимые значения — ${list.join(", ")}`);
  }
  return raw;
}

function validateInt(raw, { min, max, def, name = "Значение" } = {}) {
  // Number("") , Number(null) and Number(" ") are all 0, so an empty value used to pass as a
  // valid zero whenever min <= 0. Missing is missing: it either takes the default or is an
  // error, exactly like validateEnum above.
  const missing = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
  if (missing && def !== undefined) return def;
  if (missing) {
    throw httpError(422, `${name}: должно быть целым числом от ${min} до ${max}`);
  }
  // Booleans, arrays and objects coerce to numbers too; only the two types a client can
  // actually mean are accepted.
  if (typeof raw !== "number" && typeof raw !== "string") {
    throw httpError(422, `${name}: должно быть целым числом от ${min} до ${max}`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw httpError(422, `${name}: должно быть целым числом от ${min} до ${max}`);
  }
  return n;
}

function validateLen(raw, max, label) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw httpError(422, `${label}: некорректный формат`);
  const v = raw.trim();
  if (!v) return null;
  return v.slice(0, max);
}

module.exports = { validateLen,
  httpError,
  validateEmail,
  validatePassword,
  optionalString,
  validateUrl,
  validateEnum,
  validateInt,
};
