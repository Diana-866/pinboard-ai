# AUD-376 — Background workers, durable queues and restart recovery

**Date:** 2026-11-11  
**Status:** source audit complete; no production operations  
**Scope:** Pinterest schedule worker, email outbox, pin-image retention queue, manual-review queue, worker lifecycle and operational diagnostics.

## Executive summary

The repository has several distinct queue models; they should not be treated as one generic worker:
- Pinterest publication: durable PostgreSQL schedule rows, atomic claim, renewable claim token, publish-attempt journal and completion fencing.
- Transactional email: durable PostgreSQL outbox, `FOR UPDATE SKIP LOCKED`, two-minute lease, claim-token-guarded completion/retry, bounded exponential backoff.
- Pin-image retention: durable queue, lease token and expiry; an expired external Storage DELETE lease is moved to `blocked`, not automatically reissued.
- Manual review: durable per-user queue; it is intentionally not an auto-publishing queue.

No source-level change was justified by this audit; the key outstanding items are deployment/operations and explicit at-least-once semantics.

## Confirmed controls

### Pinterest schedule worker
1. Dedicated worker process polls backend endpoint over HTTPS; secret must be at least 32 characters and is sent in a header, not logged.
2. Worker sends one schedule per run, rejects overlapping ticks within one process, and caps HTTP timeout at 15 minutes.
3. Shutdown stops new polling and drains only for a bounded period. If an in-flight request is terminated, database claim/reconciliation is the recovery authority.
4. Backend compares scheduler secret timing-safely and enforces a server-side batch limit of one.
5. PostgreSQL claim uses row locking/skip-locked semantics and per-schedule claim identity; active claims are renewed while work runs.
6. Publish attempt journal, exact identity fencing, unknown outcomes and positive-evidence reconciliation prevent blind duplicate Pinterest submissions.
7. Migration 123 makes scheduler completion terminal: a delayed/retried completion cannot overwrite a newer run or change an already terminal run.
8. Migration 122 serializes scheduler runs using one monitor row and a 20-minute running timeout. This exceeds the worker's configured 15-minute request timeout, but actual deployment and migration state remain unverified.

### Email outbox
1. Subscription activation and outbox insert occur in one database transaction; unique event_key prevents duplicate logical enqueue.
2. Claim uses `FOR UPDATE SKIP LOCKED`, a fresh UUID claim token and a two-minute lease.
3. Mark-sent and retry operations require the matching claim token; stale workers cannot finalize another worker's claim.
4. Attempts are bounded (default 8, schema maximum 20); exponential retry delay is capped at one hour; exhausted items become dead.
5. Email delivery is explicitly **at-least-once**. SMTP acceptance followed by a lost DB acknowledgement can cause a retry and duplicate delivery. A deterministic Message-ID helps correlation but does not guarantee provider/client deduplication.
6. Dispatcher is an in-process timer every 60 seconds plus startup and payment callback triggers. On a sleeping/restarting host, retry timing is delayed until process wake/startup or another trigger. The outbox remains durable; delivery latency is not guaranteed.

### Pin-image retention
1. Claims are bounded and carry UUID tokens.
2. Expired processing claims become `blocked`, never automatically reclaimed, because a remote Storage DELETE may still be in flight.
3. Finalization checks exact bucket/path/token and unexpired claim. Uncertain external effects require manual reconciliation rather than blind retry.

### Manual review
The persistent review queue is keyed by (user_id, id), with per-user indexes and RLS; it is a human review queue, not an automatic publisher.

## Findings / operational gaps

### AUD-376-01 — Email delivery is at-least-once, not exactly-once
This is documented in migration 030 and regression tests. SMTP and PostgreSQL cannot participate in one atomic transaction. Stable Message-ID does not enforce deduplication. Keep this limitation explicit in support/product expectations; do not label the email pipeline exactly-once.

### AUD-376-02 — Email retry latency depends on backend process availability
The outbox is durable, but the dispatcher runs inside the API process. A sleeping free host or downtime pauses polling. This is a delivery-latency/availability issue, not queue data loss. If prompt transactional email becomes an SLA, use a dedicated always-on dispatcher or external scheduler after reviewing hosting cost and shared-claim behavior.

### AUD-376-03 — Live worker and migration state are unknown
Repository source contains migrations 122/123 and worker code, but no live Supabase migration ledger, deployed backend commit, Render worker service, environment variables, cron dashboard or heartbeat was inspected. A checked-in worker is not evidence that production is running it.

### AUD-376-04 — Image retention intentionally trades automatic progress for safety
An expired lease is blocked to avoid deleting an object while a previous remote DELETE may still be in flight. This requires operator monitoring and human reconciliation; an unattended blocked queue can accumulate work.

## Release / operations checklist

- [ ] Confirm deployed backend commit and applied migrations through 123 before enabling the Pinterest scheduler.
- [ ] Confirm exactly one scheduler mode is active: dedicated worker OR external cron; do not intentionally configure both.
- [ ] Verify scheduler heartbeat, due scheduled rows, stale publishing claims and unknown outcomes together.
- [ ] Verify email dispatcher is awake and SMTP configured; monitor pending/due/stale-sending/dead counts and oldest due age.
- [ ] Define an acceptable email delivery latency for current hosting plan; add a dedicated always-on dispatcher only if required.
- [ ] Monitor blocked image-retention rows and reconcile each external Storage outcome before retry.
- [ ] Keep at-least-once email behavior in product/support documentation; never promise exactly-once SMTP delivery.

## Validation and safety

- Source inspection only. No Node tests, SQL integration tests, lint, build or CI were run.
- No live Supabase, Render, SMTP, Pinterest, Storage, cron provider or deployment state was queried.
- No queue rows, secrets, schedules, email, external publication, migrations or production configuration were changed.
