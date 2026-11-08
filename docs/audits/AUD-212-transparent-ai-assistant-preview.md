# AUD-212 — Make the pricing-page AI assistant preview honest

Date: 2026-11-08  
Scope: AI Strategist block on the pricing page.  
Repository: `Diana-866/pinboard-ai`  
Branch: `feat/persisted-boards-api`

## Finding

The pricing page presented an interactive chat as an AI Strategist Bot and displayed a green "online" indicator. However, the form did not call an AI service or backend endpoint. It used a local `setTimeout` and keyword checks to return hard-coded responses. A visitor could reasonably believe they were talking to a live AI assistant when they were not.

This is a trust and product-accuracy issue rather than a payment/security bypass.

## Change

In `frontend/src/components/pricing/PricingView.tsx`:

- Removed the fake chat input, local message state, and keyword-based response handler.
- Removed the green live/online indicator.
- Replaced the simulated chat with a static bilingual example conversation.
- Added a visible "Demo / Демонстрация" badge and an explicit note that messages are not sent to a server and replies are not AI-generated.
- Kept the existing product section title and the page's normal pricing content.

## User impact

A visitor can still see the intended assistant interface and an example of the kind of question it may help with, but can no longer type into a fake chat or be misled into thinking a live AI request was processed. This makes the current product state transparent until a real assistant endpoint is implemented.

## Validation

- Fetched the updated component back from the branch and inspected the complete ending of the JSX; the static preview section and component closing tags are present.
- Frontend lint, tests, and production build were not run because no local checkout/dependencies are available in this environment.
- No AI provider calls, production changes, deployment, or merge were performed.

## Commit

- `a78ae393248fd4a90a3608cfb953d1c709ce4c25` — Make pricing AI assistant preview transparently static

## Follow-up

If this assistant is intended to be a paid feature, implement a real authenticated backend endpoint with tariff/credit checks, usage limits, abuse protection, and clear error handling before restoring an interactive input. Do not present a local canned-response handler as a live AI service.
