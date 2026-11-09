# AUD-304 — rollback title selection to server-confirmed value

## Defect
Rapid title changes are serialized per pin. The previous implementation captured the
previous optimistic title as the rollback target. If two consecutive PATCH requests
both failed, the second failure could restore the first title even though the server
had never accepted it.

## Change
- Track the latest optimistic title separately from the last server-confirmed title.
- Advance the confirmed title only after its PATCH succeeds.
- On failure, roll back only if the failed title is still the latest selection.
- Restore to the latest confirmed title, falling back to the pin's server-loaded title.
- Preserve optimistic title resolution for scheduling.

## Regression coverage
The pinTitleSelection.test.ts suite covers stale failures, failed consecutive optimistic
choices, and rollback to a previously confirmed choice.

## Verification
Source and test changes were written to the PR branch. Runtime tests, lint, and build
were not executed in this environment. Existing GitHub Actions runner failures and
Vercel build-rate-limit remain separate unresolved verification blockers.
