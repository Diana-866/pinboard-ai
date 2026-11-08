# AUD-146 — Credit reservation lifecycle and CI failure follow-up

**Date:** 2026-11-08  
**Branch:** `feat/persisted-boards-api`  
**Scope:** Source-level review of credit reservations, generation settlement, single-pin regeneration, legacy debit RPCs, and latest CI status. No production database or provider was accessed.

## Executive summary

The reviewed SQL paths consistently serialize balance mutations by locking the user row before request/reservation rows. Active reservations are counted before legacy debits, new generation requests reserve credits before provider submission, and settlement updates the balance, ledger, generated content, and reservation in one database transaction.

No confirmed double-spend or negative-balance defect was identified in the inspected paths. This is a source review, not an executed PostgreSQL proof. Do not treat the SQL integration fixtures as passing until the corresponding CI jobs complete successfully.

## Verified invariants

- Migration 054 creates unique per-user/idempotency-key reservations, rejects retries that change the reserved amount, and checks available balance under a user-row lock.
- Multi-pin settlement requires the matching active reservation and rejects a charge above its reserved ceiling. The request completion and reservation settlement occur transactionally.
- Migration 065 resizes only an active reservation owned by the current request claim and preserves other requests' reserved balance.
- Migration 066 applies the same reserved-credit pool to single-pin regeneration. It permits legacy requests without a reservation to complete only from unreserved balance.
- Migrations 074 and 075 guard the remaining generic and legacy debit RPCs against consuming active reservations. Migration 074 also checks integer balance overflow for both positive and negative adjustments.
- Provider outcomes are stored separately from customer settlement. Unknown outcomes do not transition the request to a terminal failed state, so the reservation remains held. Migrations 077 finalizers release reservations only after required provider failure/refund facts have been reconciled.
- The reviewed tests cover reservation idempotency, amount mismatch, blocked legacy debits, over-reservation rejection, definitive failure release, ambiguous outcome retention, reservation resizing, and single-pin regeneration settlement.

## Operational limitation

Active reservations intentionally have no automatic expiry. This prevents a timeout from releasing credits while a provider task may still be running or its refund state is unknown. The trade-off is that unresolved reservations can remain held indefinitely. AUD-131 contains read-only inventory queries and a manual evidence-based recovery procedure; an age-based alert/queue remains a release-gate improvement. Never release reservations solely because they are old.

## Latest CI status for commit `e8667d68a0a7d2e89040679dea89e328cbf89763`

GitHub reported these workflow runs as completed with failure:
- Persisted boards integration checks — frontend and backend jobs failed.
- Prodamus webhook tests — backend-tests job failed.
- Atomic payment fulfillment integration — postgres-atomicity job failed.

The job metadata did not include step details. Attempts to retrieve job logs returned Azure `BlobNotFound`, so the failure causes cannot be attributed to source changes or environment with confidence. The combined commit status also reports Vercel `failure`; the status payload links to the deployment but does not expose its build log here.

**CI verdict: failed checks, root causes unverified. No test is claimed to have passed.** Re-run or inspect the checks only after the log/artifact availability issue is understood; blind reruns do not establish correctness.

## Verification limits and production boundary

- Reviewed migrations 044–077 relevant to generation state, provider outcomes, reservations, and legacy debits, plus the associated SQL/shell regression fixtures.
- SQL tests and concurrency harnesses were not executed in a disposable PostgreSQL instance during this review.
- No Supabase migration was applied. No live balance, reservation, GPTunnel task, payment, or Pinterest account was read or modified.
- PR #4 remains a draft and must not be merged on the basis of this source review alone.
