# AUD-308 — release checkout idempotency keys after terminal payment status

Date: 2026-11-10

## Finding

The frontend correctly retained subscription and credit-pack checkout idempotency keys after returning a Prodamus payment URL. This prevents a reload or retry from creating a second provider invoice while the original checkout is still pending.

However, the key was not released when the authenticated pricing view later observed that the corresponding pending order had moved to a terminal state. A later intentional purchase of the same plan or credit pack could therefore reuse the old key and receive the previous checkout result.

## Change

- Exported `releasePaymentIdempotencyKey(scope)` from `frontend/src/lib/billing.ts`; the existing safe pre-provider failure path uses the same helper.
- In `PricingView.tsx`, when a previously pending subscription or credit purchase transitions to a non-pending status, release only the matching scope:
  - `subscription:<plan>:<currency>`
  - `credits:<package_id>:rub`
- The reconciliation is transition-based: unrelated historical successful purchases do not clear a currently stored key.
- Successful transitions still trigger the existing authenticated-user refresh. Cancelled/denied terminal transitions release the checkout key without treating them as successful payments.

## Safety and verification

- No backend payment state machine, Prodamus request, webhook, database migration, or production configuration changed.
- Static GitHub read-back confirmed the helper export/import and transition-based release logic.
- Automated frontend tests, lint, typecheck, and build have not been executed in this environment. Existing GitHub Actions jobs are failing before exposing job steps/logs; Vercel reports `build-rate-limit`.
- No production payment, database mutation, deployment, or PR merge was performed.
