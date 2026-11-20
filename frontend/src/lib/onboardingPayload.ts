/**
 * The body for `PATCH /me/onboarding`.
 *
 * The project this call creates is what every later generation takes its content language from, so the
 * wizard has to send the language the customer is reading. The server used to hard-code "ru" and gave every
 * non-Russian customer a Russian project; this helper is the client half of the fix and exists on its own so
 * it can be tested without a DOM.
 */
export const ONBOARDING_CONTENT_LANGUAGES = ['ru', 'en', 'de', 'fr', 'es', 'pt', 'zh', 'it', 'ja'] as const;

export type OnboardingContentLanguage = (typeof ONBOARDING_CONTENT_LANGUAGES)[number];

export interface OnboardingPayload {
  websiteUrl: string | null;
  productComment: string;
  language: OnboardingContentLanguage;
}

export function buildOnboardingPayload(
  language: string | undefined | null,
  websiteUrl: string | null | undefined,
  productComment: string | null | undefined
): OnboardingPayload {
  const normalized = String(language || '').trim().toLowerCase();
  const supported = (ONBOARDING_CONTENT_LANGUAGES as readonly string[]).includes(normalized)
    ? (normalized as OnboardingContentLanguage)
    // An unrecognised UI language must not be forwarded as-is: the server rejects it and the customer
    // cannot finish onboarding. Russian remains the product's original default, as it is on the server.
    : 'ru';
  const url = String(websiteUrl || '').trim();
  return {
    websiteUrl: url || null,
    productComment: String(productComment || '').trim(),
    language: supported,
  };
}
