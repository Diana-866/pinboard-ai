# AUD-398 — RPC contracts and lock-order specification

This is a design companion to AUD-397, not executable SQL. See `docs/audits/AUD-398-account-deletion-rpc-and-concurrency-contract.md` for full contracts and test matrix.

## Proposed RPC surface

| RPC | Caller | Atomic responsibility |
|---|---|---|
| `accept_account_deletion(uuid, integer, text)` | service_role via authenticated backend | Lock user; verify expected token_version + active status; increment both fences; invalidate auth tokens; insert request/event/fixed jobs |
| `claim_account_deletion_job(text, integer)` | worker service_role | Lock user → request → job; validate lifecycle version/dependencies; issue fresh claim token + bounded lease |
| `finish_account_deletion_job(uuid, uuid, bigint, text, text)` | worker service_role | Lock user → request → job; verify live claim/version; record allowlisted result; clear lease; append event |
| `record_account_deletion_external_receipt(...)` | provider-specific adapter | Preserve immutable external facts independently from worker claim; withhold new entitlement/publication for non-active account |

## Non-negotiable rules

- Backend derives user ID from verified JWT; never accept it from the browser body.
- Fresh password re-auth occurs in backend; raw password never enters SQL or logs.
- expected token_version closes the re-auth/password-reset race.
- Acceptance changes account fence, token_version, lifecycle_version, invalidates unused reset/verification tokens, and creates request/event/jobs in one transaction.
- Every transaction locks user first. No DB lock across external HTTP.
- A stale worker cannot finalize a job, but a late external provider receipt must not be discarded.
- Unknown payment/Pinterest/generation outcome blocks destructive downstream work; no blind retry.
- RLS alone is not a service_role boundary. Revoke direct table/sequence grants and grant only exact RPC execute.
- Existing Prodamus, Pinterest and GPTunnel lock inversions must be resolved before claiming a global lock order.

## AUD-397 schema corrections before implementation

- Manifest needs claim lease expiry paired with claim_token.
- Event append-only behavior needs database enforcement.
- Job dependencies need fixed registry or normalized FK table, not unvalidated arbitrary strings.
- Preflight must compare exact pg_catalog definitions; IF NOT EXISTS does not detect schema drift.

No SQL, route, worker, migration or production change is included.
