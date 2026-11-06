# Pinterest multi-account support: implementation plan

## Goal

Allow one PinPosy user to connect multiple Pinterest accounts and choose the destination account for every board lookup, manual publication, and scheduled publication. Keep existing one-account users working without changing their current connection.

This document is a design checkpoint only. It does not apply SQL or change production data.

## Existing constraints found in the codebase

- `pinterest_accounts` has a unique index on `user_id`; OAuth commit upserts on `user_id`.
- `getAccount(userId)` uses `.eq("user_id", userId).maybeSingle()`, so it cannot represent multiple rows.
- OAuth refresh lease and refresh commit use `user_id` as the lock / compare-and-swap key.
- OAuth connection fencing is per PinPosy user. It can remain per user for now: one pending connect attempt per PinPosy user is an acceptable first version, while already connected accounts remain usable.
- `pinterest_publish_attempts` has `unique(pin_id)`; `pinterest_publications` has `unique(pin_id)`.
- `pin_schedules` has one active schedule per `pin_id`.
- The schedule worker and publish helpers only carry the Pinterest board ID, not a PinPosy Pinterest account ID.
- The current settings card, board list, publish button, and schedule API expose only one implicit account.
- The calendar's local `accounts` presentation model is not the same as persisted OAuth connections and must not be mistaken for backend support.

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

## Implemented preparatory step (migration 031)

The branch now contains `db/migrations/031_pinterest_account_scoped_foundation.sql`. It is deliberately additive and does **not** enable multi-account behavior yet:
- adds `disconnected_at` and allows access tokens to be cleared on disconnect;
- adds nullable account references to publication, attempt, and schedule records;
- adds account-scoped refresh lease storage and acquire/release/commit RPCs;
- adds a v2 soft-disconnect RPC that clears credentials and advances the existing OAuth generation fence;
- retains the legacy unique-per-user index and legacy RPCs, so the existing single-account backend remains compatible.

A disposable PostgreSQL integration script, `backend/test/pinterest-account-foundation.integration.sql`, checks lease exclusivity, token commit, credential clearing, retained account history, OAuth fencing, and RPC permissions. The existing atomic-payment workflow now applies migration 031 and invokes this test after migrations 001–030.

This is only a foundation. The current backend still calls the legacy user-scoped methods; do not apply migration 031 to production until the new backend callers, OAuth upsert, publication journal, schedule worker, and account selectors are ready as one compatible release.

## Safe rollout sequence

1. Add additive nullable columns and new account-scoped RPCs; preserve old RPCs during compatibility window.
2. Backfill account IDs for existing publication attempts, publications, and schedules using unambiguous user-to-account matches.
3. Verify counts and detect orphaned rows before replacing unique indexes. Abort rather than guess if a row cannot be mapped safely.
4. Deploy backend support for explicit account IDs while retaining the one-account fallback.
5. Deploy frontend account and board selectors.
6. Enable multiple account creation only after migrations and backend/frontend compatibility are confirmed.
7. Remove obsolete user-only RPCs and indexes in a later cleanup migration.

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

Do not drop the old unique indexes or old RPC signatures until the new path is deployed and verified. Do not delete legacy account rows during rollout. No production migration should be applied from this branch without explicit approval and a verified backup.
