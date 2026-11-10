# AUD-164 — Pinterest inventory identity and diagnostic data integrity

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`

## Review scope

Reviewed the read-only inventory implementation from AUD-162 and the administrator UI from AUD-163 against the account-scoped publication schema and the positive-only reconciliation transaction in migration 082.

## Findings and changes

### 1. Attempt identity now includes the owner

The publication journal has a unique identity on `(pin_id, pinterest_account_id)` for non-null account IDs (migration 033). The reconciliation transaction additionally verifies the attempt's `user_id` against the schedule owner (migration 082).

The inventory previously keyed attempts by pin and account only. It now keys by owner, pin, and account, matching the full ownership boundary used by the reconciliation transaction. This prevents an inconsistent or corrupted cross-owner journal row from being selected for an inventory card or creating a misleading diagnostic hint.

### 2. Operational errors are redacted server-side

The API now redacts bearer credentials, JWT-like strings, common credential assignments, and credential-like query parameters before returning schedule and attempt error text. Output remains bounded to 320 characters. This is defense in depth; the administrator UI also performs client-side redaction.

### 3. Legacy null-account attempts are selected deterministically

The account-scoped unique index does not constrain multiple legacy rows whose account ID is null. The journal query now orders by `updated_at DESC, id DESC`, and the mapping keeps the first row for each identity. This makes the legacy display deterministic and selects the newest journal record rather than whichever row Supabase happens to return first. A regression test covers this case.

### 4. Unnecessary owner identifier removed from response

The schedule `user_id` is no longer returned because the current UI does not need it. Owner identity remains used internally for attempt matching.

### 5. Regression coverage added

Added a test fixture with a mismatched owner attempt and credential-like values in error text. The test asserts that:
- the wrong-owner attempt is not selected;
- the matching attempt is retained;
- credential-like query values are redacted;
- `user_id` is absent from the public inventory item;
- legacy null-account attempts use the newest journal row with explicit ordering.

## Confirmed schema behavior

Migration 033 creates a unique index for `pinterest_publish_attempts(pin_id, pinterest_account_id)` and account-scoped schedule uniqueness. Migration 082 rechecks schedule owner, account, pin, board, attempt status, retry safety, age, and remote publication identity inside its own transaction. The inventory remains a read-only diagnostic query and does not replace those transactional checks.

## Remaining limitations

- The schedule and attempt reads are separate queries and do not represent a transactionally consistent snapshot.
- Attempt lookup is bounded indirectly by the 100 schedule page size, but a pin with many linked accounts may still expand the journal query result. Current schema uniqueness prevents multiple journal rows for the same pin/account pair.
- The UI currently displays only the first page of at most 50 records.
- A diagnostic hint is not authorization or proof that reconciliation will succeed.

## Verification status

Static inspection only. Backend unit tests, SQL integration tests, frontend type-check/build, and browser tests have not been executed in this environment. No passing CI claim is made.

GitHub Actions status for the branch has not yet supplied a runnable result. Vercel previously reported `build-rate-limit`, which is a build quota restriction and not a source compilation result.

No production deployment, database migration, Pinterest API call, publication, retry, cancellation, or reconciliation was performed. PR #4 remains Draft and open.
