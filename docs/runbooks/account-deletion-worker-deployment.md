# Account deletion worker — deployment runbook

The account-deletion pipeline has a durable PostgreSQL queue and a separately gated worker entrypoint. The worker is intentionally disabled unless `ACCOUNT_DELETION_WORKER_ENABLED=true`.

## Deployment modes — choose one

**Mode A: worker embedded in the backend web process**

Set `ACCOUNT_DELETION_WORKER_ENABLED=true` on exactly one backend process. The API process starts `createAccountDeletionWorker` after Supabase initialization. Do not enable this on multiple web replicas unless you deliberately want multiple claimers; PostgreSQL claim-token fencing remains the concurrency boundary.

**Mode B: dedicated worker service (recommended when the web host sleeps or restarts)**

Build from repository root with build context `backend/` and Dockerfile `Dockerfile.account-deletion-worker`. The image runs:

```bash
npm run worker:account-deletion
```

Configure exactly one dedicated worker instance initially, with automatic restart on failure and no public HTTP port. Set these environment variables in the worker service:

- `NODE_ENV=production`
- `ACCOUNT_DELETION_WORKER_ENABLED=true`
- `SUPABASE_URL` — same Supabase project as the backend release.
- `SUPABASE_SERVICE_ROLE_KEY` — service-role secret for that project; never expose it to frontend or commit it to Git.
- `ACCOUNT_DELETION_WORKER_INTERVAL_MS` — optional; defaults to 30000 ms.

For Mode B, leave `ACCOUNT_DELETION_WORKER_ENABLED` unset/false on the web backend so the queue is not needlessly polled by both services. Do not deploy a worker from a different commit than the backend and SQL migrations.

## Mandatory rollout gates

This worker performs irreversible content and Storage deletion. Do not enable it merely because the image builds.

1. Confirm a recoverable backup and a separate staging Supabase project.
2. Verify the deployed schema and applied-migration history. For a new empty database, use the canonical sequence in [database setup](../database.md). For an existing database, apply only a reviewed delta set; never replay the full chain on production.
3. Validate the account-deletion migrations and RPC contracts on staging, including the complete workflow through finalization. The implementation uses the lifecycle and deletion migrations from the current migration chain (including 127–147).
4. Run the backend account-deletion worker tests and PostgreSQL integration tests against the same commit intended for deployment.
5. Use synthetic accounts with representative rows and managed Storage images. Verify that payment/provider evidence is retained, Pinterest publication states are fenced, shared images are not removed, and interrupted batches resume safely.
6. Confirm retention policy and the user-facing privacy wording against actual backup/provider retention.
7. Obtain explicit project-owner approval before enabling the worker against production data.

## Safety and operations

- A deletion request first fences the account; cleanup proceeds through durable, claim-token-fenced stages. Do not manually delete rows or Storage objects to "unstick" a job.
- Unknown payment/provider outcomes, incomplete manifests, failed Storage removal, or claim loss must remain blocked/retryable according to the persisted job state. Do not mark a job complete manually.
- Pause the worker if staging or production reports an unknown ownership mapping, unexpected foreign-key restriction, or inconsistent manifest. Preserve database state and logs for forward repair.
- The worker requires the same `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as the matching backend release. Never paste these values into issues, chat, or logs.
- The worker does not expose an HTTP health endpoint. Monitor process restarts and structured `account_deletion_worker.*` events, plus the durable queue's pending/failed/blocked state through an authenticated operator workflow.
- Stopping the worker pauses cleanup; it does not reactivate accounts or undo completed deletion stages.

This runbook describes deployment mechanics only. It is not evidence that migrations are applied, staging passed, production worker is running, or any account has been deleted.
