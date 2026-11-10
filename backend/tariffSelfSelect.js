function isTariffSelfSelectEnabled(env = process.env) {
  // Never allow self-service tariff changes in production, even if a local
  // development flag was accidentally copied into the production environment.
  return env.NODE_ENV !== "production" && env.ALLOW_TARIFF_SELF_SELECT === "1";
}

module.exports = { isTariffSelfSelectEnabled };
