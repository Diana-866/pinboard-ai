# Pinterest multi-account support: implementation plan

## Goal

Allow one PinPosy user to connect multiple Pinterest accounts and choose the destination account for every board lookup, manual publication, and scheduled publication. Keep existing one-account users working without changing their current connection.

This document tracks implementation on the feature branch. SQL files and backend/frontend changes are committed to the branch only; no migration has been applied to production.

## Existing constraints found in the codebase

- Migrations 031–032 add stable account identity and replace the unique-per-user index with unique `(user_id, pinterest_user_id)` identity; OAuth v2 upserts only the verified external Pinterest ID.
- Backend account reads now return a list, and account-specific reads require both PinPosy user ID and Pinterest account ID.
- Migration 031 and the backend refresh path use per-account leases and compare-and-swap token commits.
- OAuth connection fencing is per PinPosy user. It can remain per user for now: one pending connect attempt per PinPosy user is an acceptable first version, while already connected accounts remain usable.
- Migration 033 replaces global-per-pin uniqueness with account-scoped publication and attempt uniqueness.
- Migration 033 replaces the active schedule key with `(pin_id, pinterest_account_id)`.
- Publish helpers, schedule rows, and the worker now carry the exact Pinterest account ID.
- Settings and manual publishing now expose account selection. Schedule creation stores an account ID; the calendar UI still needs an explicit account selector when more than one account is connected.
- The calendar's local `accounts` presentation model is still mock/presentation data and is not used as a backend account identity.

## Required data model

### Pinterest accounts

Add a stable account identifier to every account-scoped operation. Keep `pinterest_accounts.id` as the canonical PinPosy account ID. Add `disconnected_at` (or an equivalent explicit connection state) and retain the row after disconnect. Make access/refresh token columns nullable only as part of the same backend rollout; on disconnect clear both credentials, set `disconnected_at`, and increment the existing per-user OAuth generation fence. Never leave usable credentials in a disconnected row.

The current schema has `access_token NOT NULL`, and the current disconnect RPC physically deletes the account row. A new account-specific disconnect RPC must soft-disconnect exactly `(user_id, account_id)`. Keep a compatibility wrapper for the old user-only RPC only during rollout; it must not silently delete every account after multiple connections are enabled. Reconnecting the same external Pinterest identity should reactivate its retained row and preserve its stable `id`; connecting a different external identity should create a different row.

Replace the unique-per-user index with a uniqueness rule for the external Pinterest identity, scoped to the PinPosy user (and handle nullable `pinterest_user_id` safely). OAuth callback must upsert the account matching both `user_id` and the verified Pinterest profile ID; it must never overwrite another connected account belonging to the same user.

A disconnect must target one `pinterest_accounts.id`, not delete every account for the user. Preserve the OAuth generation fence so a stale callback cannot restore a disconnected account. For a first safe release, a new connect attempt can supersede another pending attempt for the same PinPosy user; this only serializes connection setup, not normal use of connected accounts.

### Refresh-token coordination

Add account-scoped refresh leases keyed by `pinterest_account_id` (or by a composite account key), and compare-and-swap token commits against that account row's `id` and `updated_at`. Re-read and reconcile by account ID. Do not use user-level reads in the refresh path once multiple accounts are enabled.

### Publication identity

Add `pinterest_account_id` to:
- `pinterest_publish_attempts`
- `pinterest_publications`
- `pin_schedules`

Backfill existing rows by joining their `user_id` to the currently connected account before changing uniqueness. Preserve historical rows if an account has since been disconnected; do not fabricate a mapping where no matching account exists.

Replace global-per-pin uniqueness with account-scoped uniqueness:
- publication / attempt identity: `(pin_id, pinterest_account_id)`
- active schedule identity: `(pin_id, pinterest_account_id)`

The same local pin can then be published once to each connected Pinterest account, while duplicate prevention remains strict within one destination account.

Update all SECURITY DEFINER RPCs in the same migration set:
- `begin_pinterest_publish`
- `complete_pinterest_publish`
- `fail_pinterest_publish`
- `claim_due_pin_schedules`

Each RPC must validate that the selected account belongs to the supplied PinPosy user. Do not rely on Express-only ownership checks.

### Schedule lifecycle

The schedule worker must read `pinterest_account_id` from each claimed schedule and use that exact account for board verification and pin creation. It must not fall back to whichever account happens to be first or most recently connected.

When an account is disconnected:
- future scheduled rows for that account should be marked failed/cancelled with a clear reason, or blocked from claiming;
- rows already publishing must remain non-retryable until the publish journal is reconciled;
- historical published rows and remote Pinterest IDs must remain available.

## Plan limits

The pricing UI currently advertises Analytics = 1 account, Start = up to 3, Pro = up to 10, and Agency = unlimited. These are presentation values today, not a server-enforced multi-account policy. Add a backend plan-to-account-limit function and enforce it transactionally when an OAuth callback attempts to add a *new* external Pinterest identity. Reconnecting an already linked identity must not consume another slot. Count only active connected rows; soft-disconnected rows remain historical and do not count. Define what happens when a user downgrades below their current number of connected accounts: preserve existing connections, block new connections, and do not silently disconnect or delete accounts.

## API contract changes

- `GET /integrations/pinterest/status`: return a safe `accounts[]` list with `id`, `pinterest_user_id` only if needed, `username`, `expires_at`, and `needs_reauth`; never return credentials.
- `POST /integrations/pinterest/link`: may accept no account ID for a new connection; callback identifies the external Pinterest account from the verified profile.
- `POST /integrations/pinterest/disconnect`: require `account_id` and disconnect only that account.
- `GET /integrations/pinterest/boards?account_id=...`: require an owned connected account ID.
- `POST /pins/:id/publish`: require `account_id` plus `board_id`.
- `POST /pins/:id/schedule`: persist both `pinterest_account_id` and `pinterest_board_id`.

For backwards compatibility, a request that omits `account_id` may resolve automatically only when exactly one connected account exists. If multiple accounts exist, return HTTP 422 asking the client to choose. Never silently choose the first account.

## Frontend work

- Replace the single-account Pinterest settings card with a list of connected accounts and per-account disconnect / board refresh controls.
- Add an account selector before board selection in manual publishing and scheduling.
- Carry both account ID and board ID into schedule creation.
- Render schedule rows with their account identity.
- Do not reuse the calendar's current mock account list as if it were server-confirmed OAuth state.

## Implemented on the feature branch

The branch now contains three ordered migrations:

- **031 — account foundation:** adds `disconnected_at`, nullable token support, account references on publication/schedule records, per-account refresh leases, token commit RPC, and soft-disconnect RPC. It preserves the old one-account index at this stage.
- **032 — multi-account OAuth:** removes the old unique-per-user index and adds the external identity uniqueness rule. OAuth v2 upserts by `(user_id, pinterest_user_id)`, preserves the stable row on reconnect, and checks the server-derived plan cap inside a transaction while holding the user row lock.
- **033 — account-scoped publication:** changes publication/attempt/schedule uniqueness to account scope; adds account-validating v2 publication RPCs; and makes the schedule worker claim only schedules with a connected, exact account.

Backend changes:
- OAuth callback requires a verified Pinterest profile ID and uses the v2 commit RPC.
- Account listing and per-account disconnect are available through the Pinterest status/settings endpoints.
- Refresh lease, token commit, board lookup, manual publication, and worker publication are account-scoped.
- A request without `account_id` resolves automatically only when exactly one active account exists; otherwise the API returns HTTP 422.
- The manual publish button and settings card now list/select connected Pinterest profiles.
- Schedule creation persists `pinterest_account_id`; the backend refuses to guess when multiple accounts exist. The calendar still needs an account selector to make that flow convenient for multi-account users.

Plan caps enforced by the OAuth commit RPC are Analytics = 1, Start = 3, Pro = 10, Agency = unlimited. Reconnecting an existing external identity does not consume another slot. Soft-disconnected identities do not count.

Disposable PostgreSQL checks now cover the foundation, OAuth identity/upsert and plan caps, and account-scoped publication/scheduling. The atomic-payment workflow applies migrations 031–033 and runs these checks. GitHub Actions has not yet produced an executed test step in the recent runs (`steps: null`), so the SQL checks are added but not confirmed passing.

These changes exist only on the feature branch. No production migration has been applied and no PR has been merged.

## Remaining rollout sequence

1. Finish the calendar account selector and verify the manual publish and schedule flows end-to-end.
2. Inspect production row counts and identify historical publication/schedule records whose Pinterest account cannot be mapped unambiguously. Migration 033 deliberately leaves those references null; the worker will not guess an account for legacy queued rows.
3. Validate migrations 031–033 and the PostgreSQL integration scripts in a working CI runner.
4. Review the PR diff and deployment compatibility. Apply migrations and deploy backend/frontend only as one explicitly approved rollout; no production migration has been run from this branch.
5. After live OAuth, refresh, manual publishing, and scheduled publishing are verified, remove obsolete user-scoped RPCs in a separate cleanup migration.

## Tests required before merge

- Two accounts for one PinPosy user can coexist; same Pinterest identity cannot be duplicated for that user.
- OAuth reconnect updates only the matching account; stale callbacks cannot restore a disconnected account.
- Disconnect clears credentials and marks one account disconnected while preserving its stable ID and historical references.
- Plan account limits are enforced in the database transaction; reconnecting an existing identity does not consume a new slot, and downgrade never silently disconnects accounts.
- Disconnecting account A does not affect account B.
- Refresh leases for A and B do not block one another; stale refresh cannot overwrite a newer reconnect.
- Board lookup, manual publish, and schedule creation reject an account belonging to another PinPosy user.
- A pin can publish once to A and once to B, but cannot duplicate within A.
- Same pin can have one active schedule per account, but not two active schedules for A.
- Worker publishes each schedule through its exact account, even when accounts are connected/reordered.
- Existing one-account installations continue to work with omitted `account_id`.
- Missing/ambiguous legacy account mapping is surfaced for review and is never silently assigned.

## Rollback constraints

Migration 032 drops the legacy unique-per-user index and migration 033 replaces the global publication/schedule indexes on this feature branch. Do not apply these migrations to production until the new backend and frontend are deployed together, CI has actually executed the integration checks, historical rows have been reviewed, and an explicit approval plus verified backup exists. Keep legacy RPCs during the compatibility window; do not delete account rows.
