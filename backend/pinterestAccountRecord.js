/**
 * Decode a Pinterest account row and lazily migrate token ciphertext to the
 * active encryption key. Dependencies are injected so optimistic concurrency
 * behavior can be regression-tested without a live Supabase instance.
 */
async function decodePinterestAccountRecord(data, {
  supabase,
  hasEncryptionKey,
  isEncryptedToken,
  isEncryptedWithActiveKey,
  encryptToken,
  decryptToken,
  now = () => new Date().toISOString(),
}) {
  if (!data) return null;
  let stored = data;

  // A refresh uncertainty fence is durable state: never rewrite that row here.
  if (hasEncryptionKey() && data.refresh_state !== "uncertain" &&
      ((!isEncryptedToken(data.access_token) || !isEncryptedWithActiveKey(data.access_token)) ||
       (data.refresh_token && (!isEncryptedToken(data.refresh_token) || !isEncryptedWithActiveKey(data.refresh_token))))) {
    const encrypted = {
      access_token: data.access_token ? encryptToken(decryptToken(data.access_token)) : null,
      refresh_token: data.refresh_token ? encryptToken(decryptToken(data.refresh_token)) : null,
      updated_at: now(),
    };
    const { data: updated, error: updateError } = await supabase
      .from("pinterest_accounts")
      .update(encrypted)
      .eq("id", data.id)
      .eq("user_id", data.user_id)
      .eq("updated_at", data.updated_at)
      .select("*")
      .maybeSingle();
    if (updateError) throw updateError;

    // No returned row means our version lost the optimistic race. Keep reading
    // the snapshot we already fetched; never issue a blind update or overwrite
    // the newer row. The previous key must remain configured until it is migrated.
    stored = updated || data;
  }

  return {
    ...stored,
    access_token: decryptToken(stored.access_token),
    refresh_token: decryptToken(stored.refresh_token),
  };
}

module.exports = { decodePinterestAccountRecord };
