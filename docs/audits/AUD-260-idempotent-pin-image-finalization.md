# AUD-260 — Idempotent pin image lifecycle finalization

Date: 2026-11-09

## Defect

A Storage upload/delete could complete and its PostgreSQL lifecycle finalization could commit while the RPC response was lost. The first backend call then observed a transport/database error. Replaying the same finalization previously returned false because the first call had cleared the claim token. This made a completed operation appear unsuccessful and complicated recovery.

## Changes

- Added migration 100, adding last_finalized_token to pin_image_object_lifecycle.
- Upload and deletion finalization now persist the exact fencing token and terminal result.
- A repeated finalization is acknowledged only when the same token and same terminal state/error code were already committed. Different tokens and conflicting outcomes remain rejected.
- Backend retries each lifecycle finalization RPC at most once, with identical arguments and the same token. This covers a transient failure before commit and a lost response after commit.
- Ambiguous Storage operations themselves are not automatically retried. Existing claim fencing and quarantine behavior remains unchanged.
- Added Node unit coverage for transient finalize RPC errors on both upload and deletion.
- Added PostgreSQL integration coverage for idempotent success/failure, wrong tokens, and conflicting terminal outcomes.
- Added migration 100 to atomic-payment integration CI and documented the behavior in docs/storage-lifecycle.md and HANDOFF.md.
- Fixed a pre-existing malformed YAML line in the same workflow: the managed-image lifecycle test step and the following step had been serialized with literal `\\n` characters on one line. The workflow now has separate valid `name` and `run` entries.

## Verification status

Read-back confirmed on PR head `a0c132335f748a92a0676bf9abc14755193a881d`. The malformed literal-\\n workflow line is now split into separate YAML step entries, and migration 100 is included in the atomic-payment workflow.

The three PR workflows (atomic-payment integration, persisted boards integration, and Prodamus webhook tests) report `failure`. GitHub Jobs API returned `steps=null` and `logs_url=null`; attempts to download the logs returned `BlobNotFound`. Therefore it is not possible to confirm that the runner executed the test steps, and the new Node/PostgreSQL tests must not be treated as passing. Vercel preview also reports `build-rate-limit`.

Migration 100 has not been applied to production Supabase. No production Storage operations, deployment, or PR merge were performed. PR #4 remains open and Draft.
