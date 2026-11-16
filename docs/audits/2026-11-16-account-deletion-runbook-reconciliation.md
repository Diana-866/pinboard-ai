# Account deletion and scheduler runbook reconciliation

Date: 2026-11-16  
Source HEAD: 7c799cef0b4c63896dddadee0017eaed79c66df6

## Findings corrected

- AUD-389 claimed no self-service endpoint or end-to-end worker existed. This is stale: main contains the account deletion routes, migrations 127–148 and backend/accountDeletionWorker.js.
- AUD-396 was still labelled design/runbook only. It is now clearly historical; its proposed workflow/schema is not the current executable contract.
- AUD-398 and AUD-395 contained pre-implementation RPC/schema/manifest proposals. They are marked superseded/historical so they are not mistaken for current migration/API instructions.
- AUD-397 proposal SQL is explicitly marked superseded by numbered migrations 127–148 and must not be executed.
- AUD-386 scheduler runbook now clarifies migrations 122–123 are already in the main migration chain; their presence in Git does not prove production application. Scheduler activation remains behind runtime SQL/staging gates and owner approval.

## Evidence

- backend/accountDeletionWorker.js exists and implements the dedicated durable account deletion worker.
- Migrations 130, 137 and 138 respectively define durable queue, content erasure stage and tombstone finalization.
- The active migration chain on main is 010–148; production migration state remains unverified.
- No deletion worker, production scheduler, production DB or provider action was executed during this review.
