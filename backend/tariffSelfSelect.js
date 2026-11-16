function isTariffSelfSelectEnabled(env = process.env) {
  // Fail closed when NODE_ENV is missing or unfamiliar. Only explicit local
  // development/test environments may enable self-selected paid entitlements.
  return ["development", "test"].includes(env.NODE_ENV) &&
    env.ALLOW_TARIFF_SELF_SELECT === "1";
}

module.exports = { isTariffSelfSelectEnabled };
