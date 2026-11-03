// Build absolute frontend URLs only from trusted server configuration.
const DEFAULT_FRONTEND_URL = "https://pinposy.com";

function frontendBaseUrl(configured = process.env.FRONTEND_URL) {
  const candidate = String(configured || DEFAULT_FRONTEND_URL).split(",")[0].trim();
  try {
    const parsed = new URL(candidate);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      return DEFAULT_FRONTEND_URL;
    }
    return parsed.origin;
  } catch {
    return DEFAULT_FRONTEND_URL;
  }
}

module.exports = { frontendBaseUrl };
