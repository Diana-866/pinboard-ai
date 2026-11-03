const supabase = require("./supabase");

async function getBalance(userId) {
  const { data, error } = await supabase.from("users").select("credits_balance").eq("id", userId).single();
  if (error) throw error;
  return data.credits_balance;
}

// Баланс и журнал изменяются внутри одной транзакции PostgreSQL.
async function adjustBalance(userId, amount, type, description) {
  const { data, error } = await supabase.rpc("adjust_credits_balance_and_log", {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_description: description || null,
  });
  if (error) throw new Error(error.message || "Не удалось изменить баланс");
  return data;
}

module.exports = { getBalance, adjustBalance };
