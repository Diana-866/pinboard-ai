const supabase = require("./supabase");

async function adjustBalance(userId, amount, type, description) {
  const { data: newBalance, error: rpcError } = await supabase.rpc("adjust_credits_balance", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (rpcError) throw new Error(rpcError.message || "Не удалось изменить баланс");

  const { error: txError } = await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount,
    type,
    description,
  });
  if (txError) throw txError;

  return newBalance;
}

module.exports = { getBalance, adjustBalance };