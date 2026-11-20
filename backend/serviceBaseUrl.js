"use strict";

/**
 * A base address for an outbound provider, with a deliberately narrow test seam.
 *
 * The AI and Pinterest paths are where money leaves the account and where a duplicate has real cost, and
 * neither could be exercised because every call goes to a hard-wired address. This function exists so a test
 * can point one child process at a local stand-in through `<NAME>_BASE_URL`.
 *
 * It fails closed: an override is honoured only when the environment is explicitly development or test,
 * exactly like the dev top-up and the rollout gates. In production, staging, or with NODE_ENV unset the
 * constant wins, because a redirected provider would receive customer data and the provider's credentials.
 */
function resolveServiceBaseUrl({ env, variable, defaultBase }) {
  const override = String((env && env[variable]) || "").trim();
  if (!override) return defaultBase;
  const nodeEnv = String((env && env.NODE_ENV) || "").trim().toLowerCase();
  if (!["development", "test"].includes(nodeEnv)) return defaultBase;

  let parsed;
  try {
    parsed = new URL(override);
  } catch {
    return defaultBase;
  }
  // Only HTTP(S): a provider address on any other scheme is a configuration mistake, not a destination.
  if (!["http:", "https:"].includes(parsed.protocol)) return defaultBase;
  if (parsed.username || parsed.password || !parsed.hostname) return defaultBase;
  return override.replace(/\/+$/, "");
}

module.exports = { resolveServiceBaseUrl };
