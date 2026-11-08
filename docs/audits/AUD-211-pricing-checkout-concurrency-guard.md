# AUD-211 — Prevent concurrent checkout creation in pricing UI

Date: 2026-11-08  
Scope: Pricing screen checkout interaction for subscriptions and non-expiring credit packs.  
Repository: `Diana-866/pinboard-ai`  
Branch: `feat/persisted-boards-api`

## Finding

The pricing screen tracked an in-progress subscription checkout and credit-pack checkout separately. It disabled only the exact plan or pack being submitted. While one request was being created, another plan or a different credit pack could still be clicked. A fast user could therefore create multiple distinct pending Prodamus orders from what was intended as one checkout action.

This did not bypass payment verification or cause duplicate credit fulfillment: every order still had its own server-generated order ID and the existing webhook/RPC safeguards. The problem was unnecessary duplicate invoices, confusing payment history, and the risk that a customer might pay for more than one accidentally-created order.

## Change

In `frontend/src/components/pricing/PricingView.tsx`:

- Added one synchronous `useRef` checkout lock shared by subscription and credit-pack actions. The ref is set before awaiting the API request, so two handlers cannot both begin in the same render window.
- While any checkout is in progress, all subscription and credit-pack purchase buttons are disabled, including duplicate buttons for the same pack shown in the card grid and comparison table.
- If checkout creation fails, the lock is released and the relevant loading state is cleared, allowing the user to retry.
- Successful checkout keeps the lock while the browser navigates to Prodamus.

## User impact

If a user starts buying the Start plan and immediately clicks a different plan or credit pack, the second action is ignored and its button remains disabled. The same applies in the opposite direction: starting a credit-pack checkout blocks plan checkout until navigation or an error. If the server rejects the first request, the buttons become available again.

This is a frontend safety guard, not server-side idempotency. It does not protect against duplicate orders from multiple tabs, devices, browser retries, or direct API calls. Those require a separate server contract and persistent idempotency key.

## Validation

- Source was fetched back from the branch after the change and checked for the shared lock, both handler guards, and all three purchase-button disable conditions.
- Frontend test/build/lint was not run because this environment has no local checkout or installed dependencies.
- No payment provider calls, real payments, production database changes, deployments, or PR merges were performed.

## Commit

- `89c101669258b8a9e03518b0ef467aa24e9e869c` — Prevent concurrent plan and credit checkout creation

## Follow-up

Consider server-side checkout idempotency only after defining the lifecycle for a pending Prodamus order (link persistence, expiration, cancellation, and ambiguous provider-link creation). Do not reuse an old pending order unless its actual checkout URL and provider-side validity can be established safely.
