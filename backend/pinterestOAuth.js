// Normalize the optional access-token lifetime returned by Pinterest OAuth.
function getPinterestTokenExpiresAt(expiresIn, now = Date.now()) {
  if (expiresIn === null || expiresIn === undefined ||
      (typeof expiresIn === "string" && expiresIn.trim() === "")) {
    return null;
  }

  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(now)) {
    throw new Error("Pinterest returned an invalid token expiry");
  }

  const expiresAtMs = now + seconds * 1000;
  if (!Number.isFinite(expiresAtMs)) {
    throw new Error("Pinterest returned an invalid token expiry");
  }

  const expiresAt = new Date(expiresAtMs);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new Error("Pinterest returned an invalid token expiry");
  }
  return expiresAt.toISOString();
}

module.exports = { getPinterestTokenExpiresAt };
