# AUD-274 — idempotent persisted-board creation

Date: 2026-11-09  
Branch: `feat/persisted-boards-api`

## Finding

The authenticated `POST /boards` route previously used a plain insert. If PostgreSQL committed the row but the HTTP response was lost, retrying the form created a second board. Frontend error retention alone did not make the operation safe.

## Changes

- Added nullable `create_request_id` and `create_request_fingerprint` columns to `public.boards`.
- Added a unique index on `(project_id, create_request_id)`. PostgreSQL's normal NULL-distinct behavior preserves existing rows and legacy clients that omit the key.
- Added a check constraint requiring a SHA-256 hex fingerprint whenever a request UUID is present.
- Updated authenticated `POST /boards` to validate the optional UUID, verify project ownership as before, and use `upsert(... ignoreDuplicates: true)` against the unique key. It then reads the canonical row and compares the immutable payload fingerprint.
- Replays with the same key and payload return the original board. Reuse of the same key with different payload returns HTTP 409 and does not mutate the original row.
- The internal fingerprint is not returned in the API response.
- The board-creation form now creates one UUID per logical attempt, retains it after a failed/uncertain submission (including closing and reopening the modal), and changes it when the user edits the title/category or completes a successful save.
- Legacy clients without `create_request_id` continue through the existing insert path.
- Added PostgreSQL regression coverage for replay, stable identity, conflicting payloads, and invalid fingerprints; wired migration 111 and the test into the disposable PostgreSQL integration workflow.

## Verification

- Read back the modified backend route, frontend form, migration, regression SQL, and workflow from the branch.
- Confirmed the route still verifies project ownership before writing.
- Confirmed the database unique constraint, rather than an application-level read-before-write, is the concurrency boundary.
- The PostgreSQL regression and frontend checks have not yet been executed in this environment. Previous GitHub Actions runs for this PR have failed before providing usable job logs; do not treat CI as passing until a runner executes the updated workflow.
- Migration 111 has not been applied to the production Supabase database. No deployment, merge, or production mutation was performed.

## Rollout requirement

Apply `db/migrations/111_idempotent_board_creation.sql` to the target database before deploying the backend code that writes the new columns. Do not deploy the updated backend ahead of the migration.


## Follow-up hardening

- Disabled the title and category controls while a board save is in flight. This prevents the visible form state from diverging from the payload already submitted and keeps the request key tied to the submitted values.
- Connected the title/category labels to their respective controls with explicit `htmlFor`/IDs.
