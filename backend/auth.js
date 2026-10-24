const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("./supabase");
const { httpError, validateEmail, validatePassword } = require("./validate");

const TOKEN_TTL = "7d";

// Заглушка для сравнения пароля, когда пользователя нет —
// защита от тайминг-атак (ответ всегда одинаково долгий)
const DUMMY_HASH = bcrypt.hashSync("invalid-placeholder-password", 10);

async function register(rawEmail, rawPassword, rawName, rawSurname) {
  const email = validateEmail(rawEmail);
  const password = validatePassword(rawPassword);

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    throw httpError(409, "Пользователь с таким email уже существует");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const profile = {};
  if ((rawName || '').trim()) profile.name = rawName.trim().slice(0, 80);
  if ((rawSurname || '').trim()) profile.surname = rawSurname.trim().slice(0, 80);

  // Если миграция 003 (колонки name/surname) ещё не применена — регистрируем без профиля
  let data, error;
  try {
    ({ data, error } = await supabase
      .from("users")
      .insert({ email, password_hash: passwordHash, credits_balance: 0, ...profile })
      .select()
      .single());
    if (error) throw error;
  } catch (eCol) {
    ({ data, error } = await supabase
      .from("users")
      .insert({ email, password_hash: passwordHash, credits_balance: 0 })
      .select()
      .single());
  }
  if (error) throw new Error(error.message);

  const token = jwt.sign({ userId: data.id }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
  return { token, user: { id: data.id, email: data.email } };
}

async function login(rawEmail, rawPassword) {
  const email = validateEmail(rawEmail);
  validatePassword(rawPassword); // единая проверка формата, чтобы не раскрывать наличие аккаунта

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  const isValid = await bcrypt.compare(rawPassword, user?.password_hash || DUMMY_HASH);
  if (!user || !isValid) {
    throw httpError(401, "Неверный email или пароль");
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
  return {
    token,
    user: { id: user.id, email: user.email, credits_balance: user.credits_balance },
  };
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { register, login, verifyToken };
