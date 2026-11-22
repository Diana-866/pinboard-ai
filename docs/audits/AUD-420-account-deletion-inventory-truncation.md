# AUD-420 — Account-deletion inventory truncation and row validation

- Date: 2026-11-22
- Base main: `5f168f287cf49b3552b90794439292c7265ad38c`
- Scope: read-only administrative deletion inventory; no production DB or external service.

## Finding

The deletion inventory limited the attention-job query to the requested count but did not indicate that additional blocked/retrying/running jobs existed. This could make a partial operational queue look complete. Returned rows were also mapped permissively: malformed identifiers were stringified, invalid counters became null, and invalid timestamps could be surfaced without a trustworthy age.

## Change

- Query one sentinel row beyond the requested limit (the configured limit is capped at 100, so the query remains bounded).
- Return at most the requested number of jobs and add `requiring_attention_truncated` to signal omitted rows.
- Validate job/request UUIDs, step key, status, non-negative safe attempts and timestamps before producing an operator-facing row; malformed rows fail closed.
- Validate the oldest pending request record and timestamp.
- Add regressions for sentinel truncation and malformed operational rows.

## Verification

- Static review of the source/test changes and inventory consistency: recorded in closeout.
- Node focused/full suite, PostgreSQL replay, GitHub Actions runtime, admin UI compatibility and deployment: NOT RUN in this connector session. No PASS is claimed.
- No production DB, deletion worker, payment/provider, Pinterest, Storage, DNS or deployment operation performed.

## Owner acceptance

Run the focused inventory and test-inventory checks plus the full backend suite on the published main commit. Confirm the admin UI handles the additive `requiring_attention_truncated` field and does not represent a truncated list as complete.


## Publication receipt (2026-11-22)

- Commit containing the AUD-420 implementation, regression and inventory update: `ed5bceab60ec39e6bf8f098566996306d04f846d`.
- Blob SHAs at that commit: source `0b973f6f956a064e9693ad62497de0100abe283c`; test `8c8ea7216960c1a788d296efb580eb2d5c93a88f`; inventory `afb9a0366ce06555882c22ed7e5bdbf84400f9ce`; audit `2fbbf27871ae612f19eb83ca9a620461714fcd41`.
- At that commit, the inventory was 1,457 declarations and the deletion inventory test file had 12 declarations.
- Later AUD-421 adds one separate admin-access regression; current main inventory is 1,458.
- Runtime, admin UI compatibility and deployment remain NOT RUN; owner acceptance is still required.
