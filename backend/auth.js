const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("./supabase");

async function register(email, password) {
  const { data: existing } = await supabase.from("users").select("id").eq("email", email).single();

  if (existing) {
    throw new Error("Пользователь с таким email уже существует");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from("users")
    .insert({ email, password_hash: passwordHash, credits_balance: 0 })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const token = jwt.sign({ userId: data.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
  return { token, user: { id: data.id, email: data.email } };
}

async function login(email, password) {
  const { data: user, error } = await supabase.from("users").select("*").eq("email", email).single();

  if (error || !user) {
    throw new Error("Неверный email или пароль");
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new Error("Неверный email или пароль");
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
  return { token, user: { id: user.id, email: user.email, credits_balance: user.credits_balance } };
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { register, login, verifyToken };
