const supabase = require("./supabase");

async function getBalance(userId) {
  const { data, error } = await supabase.from("users").select("credits_balance").eq("id", userId).single();
  if (error) throw error;
  return data.credits_balance;
}

async function adjustBalance(userId, amount, type, description) {
  const { data, error } = await supabase.rpc("adjust_credits_balance_and_log", {
    p_user_id: String(userId),
    p_amount: amount,
    p_type: type,
    p_description: description || null,
  });
  if (error) {
    const failure = new Error(error.message || "Не удалось изменить баланс");
    // Preserve the database error code so callers/logs can tell "insufficient
    // credits" apart from a transport failure.
    if (error.code) failure.code = error.code;
    throw failure;
  }
  return data;
}

module.exports = { getBalance, adjustBalance };