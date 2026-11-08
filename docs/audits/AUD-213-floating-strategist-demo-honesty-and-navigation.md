# AUD-213 — Remove fabricated Pinterest insights from the floating strategist demo

Date: 2026-11-08  
Scope: Floating PinPosy strategist widget, navigation helper, and seven interface locales.  
Repository: `Diana-866/pinboard-ai`  
Branch: `feat/persisted-boards-api`

## Finding

The floating strategist widget was still presenting itself as a live account analyst. Its translations claimed it had analyzed a named Pinterest account and showed fabricated impressions, saves, CTR, audience demographics, board growth, SEO scores, and trending keywords. The widget had no backend or Pinterest-data connection. It also displayed a green online state and simulated a delayed AI response.

This was materially misleading: users could mistake sample numbers for their own account analytics and make publishing decisions based on invented data. The earlier AUD-212 change corrected only the pricing-page preview; it did not cover this separate floating widget.

## Changes

1. Rewrote the bot copy in all seven supported interface locales (German, English, Spanish, French, Portuguese, Russian, Chinese):
   - Removed named-account references and all invented performance numbers/trend claims.
   - Replaced claims of completed analysis with explicit demo-mode wording.
   - Added localized `demoReply`, `openSection`, `statusBadge`, `dock`, and `undock` strings.
   - Changed the badge from an online claim to a demo/no-live-data status.
2. Updated `FloatingStrategistBot.tsx`:
   - The widget now answers with an explicit navigation-demo message, not a fabricated analysis.
   - Removed the fake typing delay/indicator; replies are immediate and deterministic.
   - Localized the action button and dock/undock titles.
   - Kept the visible disclaimer that Pinterest account data is not connected.
3. Extracted text-to-section matching into `frontend/src/utils/demoNavigation.ts`.
   - Supports common navigation wording across all seven supported interface languages.
   - Routes to boards, calendar, pin generator, competitors, keywords, analytics, pricing, or settings.
   - Returns no destination for unrelated text rather than inventing an answer.
4. Added `frontend/src/utils/demoNavigation.test.ts` for ten multilingual routing cases plus empty/unrelated input.

## User impact

A user who asks about their best-performing pin will no longer receive invented impressions or save rates. The assistant clearly says it cannot inspect Pinterest data. If the user asks where to find analytics, a calendar, boards, or another supported section, it can offer a button to open that section. It is now a navigation demo, not a live AI analyst.

## Validation

- Re-fetched the component, helper, test, translation schema, and all seven locale files from the branch.
- Confirmed all seven locale bot blocks contain the new demo/navigation/status/dock labels and no longer contain the former sample metrics or named-account claims.
- Confirmed the component imports and uses the extracted helper; no fake typing timer or online status reference remains.
- Confirmed test cases cover all seven locales and the major navigation destinations.
- Tests, TypeScript lint, and production build were not run: this environment has no local checkout or installed dependencies. The source checks above are not a substitute for running `npm test` and `npm run lint`.
- No Pinterest API calls, production changes, deployment, or PR merge were performed.

## Commits

- `f9b537b5cd98c98c5996bfd308fa03dd200dcfc7` — localize demo status/action
- `d5336c8c3350c7c27230c133a012552b64115557` — rename online status translation key
- `8f3d1916338c7379f47ce369edc679744af1569e` through `a1fd2eb22e8f99d6b5ecc5c426e8d7dc8ece0bd3` — honest copy in all locales
- `469ad1059baf412f712c176ce02a0c2302940f54` and sibling locale commits — add localized demo replies
- `e9ec39a1177c3c06c69e76cbf6ab992e1cc7bcf2` — remove fake typing and add multilingual routing
- `5b5c71d0181b7273e0dde22379cb4d9b984814e1`, `05bc016114d776e62830b6924e190ded0b8f428d`, `128d4fa0a4a07a43b34baa41573685ed83a6b6bc`, `7b3e8e362ab35e9a3ab3117866bbcbe355ddb3ac` — helper, tests, integration, test import
- `0802f5a348a141a036a41ed00f99ff71da0f9e0e` and locale/component commits — dock labels

## Follow-up

The widget can be upgraded to a real AI analyst only after a backend endpoint can securely fetch the authenticated user's Pinterest data, enforce plan/credit limits, and clearly distinguish unavailable or stale analytics. Until then, it must remain visibly labeled as a demo.
