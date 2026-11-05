// Parse a single Bearer credential from an Authorization header.
function extractBearerToken(header) {
  const match = String(header || "").trim().match(/^Bearer\\s+([^\\s]+)$/i);
  return match ? match[1] : "";
}

module.exports = { extractBearerToken };
