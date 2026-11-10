# AUD-305 — queued aspect-ratio changes and confirmed rollback

## Defect

The active pin's aspect-ratio controls were disabled for the full duration of a PATCH.
This forced users to wait for each network response before correcting a selection.
The existing rollback helper also accepted the previous UI value as its rollback
target. If consecutive optimistic changes were allowed and both requests failed,
the second failure could restore a ratio that had never been persisted.

## Change

- Allow another ratio selection while a prior ratio PATCH is pending.
- Reuse the per-pin FIFO save queue so requests reach the API in user-selection order.
- Track the last server-confirmed ratio separately from the optimistic canvas value.
- Advance the confirmed value only after a successful PATCH.
- On failure, roll back only if that failed choice is still the current displayed value,
  and restore the last server-confirmed ratio.
- Keep the saving state active while a newer queued save for the same pin remains pending.

## Regression coverage

Added a test proving that two consecutive failed optimistic ratio choices restore the
original server-confirmed ratio rather than the first unconfirmed choice.

## Verification

Changes were written to the PR branch and read back from GitHub. Runtime tests, lint,
typecheck, and build have not been run in this environment. Existing GitHub Actions
runner failures and Vercel build-rate-limit remain unresolved verification blockers.
No production database changes, deployment, or merge.
