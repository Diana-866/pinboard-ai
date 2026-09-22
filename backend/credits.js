const supabase = require("./supabase");

async function getBalance(userId) {
  const { data, error } = await supabase.from("users").select("credits_balance").eq("id", userId).single();
  if (error) throw error;
  return data.credits_balance;
}

async function adjustBalance(userId, amount, type, description) {
  const balance = await getBalance(userId);
  const newBalance = balance + amount;

  const { error: updateError } = await supabase
    .from("users")
    .update({ credits_balance: newBalance })
    .eq("id", userId);
  if (updateError) throw updateError;

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