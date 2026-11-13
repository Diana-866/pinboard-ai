const SUPPORTED_PROJECT_LANGUAGES = new Set(["en", "ru", "es", "pt", "de", "fr", "zh"]);

/**
 * Resolve the initial project language from the user's registration preference.
 * Unknown or missing legacy values safely fall back to Russian.
 */
function resolveProjectLanguage(value) {
  return typeof value === "string" && SUPPORTED_PROJECT_LANGUAGES.has(value)
    ? value
    : "ru";
}

module.exports = { resolveProjectLanguage };
