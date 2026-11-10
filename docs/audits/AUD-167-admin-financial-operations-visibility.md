# AUD-167 — Expose unresolved financial operations in the admin UI

## Finding

The backend already exposed a bounded, read-only queue at `GET /admin/financial-operations/unresolved`. It classifies old generation requests, regeneration requests, and active credit reservations, including unresolved provider outcomes and refund facts. The admin panel had no tab or component consuming this endpoint, so an operator had to know the API existed and inspect it outside the product.

This was an operational usability gap, not a payment-settlement or authorization bypass. The endpoint remains protected by the existing authenticated administrator gate.

## Implementation

- Added `frontend/src/components/admin/AdminFinancialOperations.tsx`.
- Added an admin navigation tab and mounted the component in `AdminPanel.tsx`.
- The screen calls the existing endpoint with a 30-minute age threshold and a maximum of 50 rows per category.
- Displays generation, regeneration, and old active credit-reservation queues separately, with age, last update, task outcome counts, provider state, and human-readable reason labels.
- Displays a clear read-only warning: the screen does not refund, release credits, retry provider work, or finalize operations. Age alone is not proof of provider failure or refund.
- Shows truncation notices when a category exceeds the bounded page size and supports manual refresh.
- Does not expose user emails, webhook payloads, credentials, or raw provider responses.

## User-visible effect

An administrator can now open **Admin → Незавершённые операции** and see which AI operations or credit reservations need investigation. This makes existing recovery safeguards discoverable and reduces the chance that a stuck generation or reserved balance remains unnoticed simply because the operator did not know which endpoint to query.

The screen is intentionally observational. It does not perform financial actions; reconciliation/finalization still requires the existing separately protected operator workflow and verified evidence.

## Verification and scope

- Static source review confirms the component uses the existing authenticated admin endpoint and only renders returned queue data.
- The endpoint response shape was matched against `backend/adminFinancialOperations.js`.
- GitHub confirms the PR branch contains the component and navigation wiring.
- A frontend TypeScript/build run has not been performed in this environment; CI status must not be inferred from source review.
- No database migration, provider request, production data change, deployment, or PR merge was performed.
