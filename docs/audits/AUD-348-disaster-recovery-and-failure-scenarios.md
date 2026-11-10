# AUD-348 — disaster recovery and infrastructure failure scenarios

**Date:** 2026-11-11  
**Status:** SOURCE REVIEW COMPLETE  
**Runtime/live validation:** not executed

## Executive summary

PinPosy has meaningful application-level recovery for interrupted operations, but the repository does not establish end-to-end disaster recovery for loss of a hosting provider, database, or object storage. No measured RPO/RTO or successful full restore drill is evidenced.

The infrastructure requirements document explicitly treats the target architecture as not yet selected/deployed/verified and records 0/70 infrastructure checklist items completed at its 2026-11-09 baseline. This audit does not claim that status has changed.

## Failure-mode matrix

| Failure | Existing protection | User/service impact | Recovery boundary |
|---|---|---|---|
| Frontend/Vercel unavailable | Frontend is static SPA; source in GitHub | App UI unavailable; backend data not thereby lost | Redeploy exact known-good commit to a verified host/CDN; no tested alternate host or DNS cutover |
| Backend process/host restart | Durable DB journals; worker is a separate process; graceful shutdown attempts short drain | API temporarily unavailable; in-flight external calls may become ambiguous | Generation and Pinterest recovery reconcile from durable records; no verified alternate backend deployment |
| PostgreSQL unavailable | Critical operations persist state transactionally; DB is source of truth | Auth and most API operations fail; writes stop | Restore/reconnect only after DB is healthy; no verified replica/failover/independent backup evidence |
| PostgreSQL data loss/corruption | Migrations and SQL integration fixtures exist | Potential loss of users, boards, pins, balances, payments, tokens, queues | Requires independent backup + restore drill; absent evidence means recovery is unproven |
| Supabase Storage outage/loss | Upload lifecycle journal preserves completed provider output before rehosting; deletion is reference/lifecycle guarded | Existing image URLs may fail; new uploads/rehosting fail | Recover objects from independent backup or rehost from retained provider source when still available; full Storage backup unverified |
| GPTunnel unavailable | Generation requests and provider task outcomes are journaled; safe retry boundaries | AI generation pauses/fails; already-submitted jobs may remain pending/unknown | Do not blindly resubmit ambiguous billable requests; reconcile task journal and provider evidence |
| Pinterest API unavailable | Durable schedules, leases, attempt journal, retry_safe and unknown states | Publishing delayed; ambiguous posts are held | Retry only explicit safe failures; reconcile remote pin evidence before manual resolution |
| Prodamus unavailable | Local checkout request is persisted before outbound create; unknown state fences unsafe recreation; signed webhook fulfillment is idempotent | New checkouts may be unavailable; pending payments may be unresolved | Compare provider dashboard and local records; do not cancel/reissue based only on age |
| SMTP unavailable | Transactional email outbox with leases/backoff | Verification/notifications delayed; exhausted rows become dead | Restore SMTP then inspect/retry outbox; delivery is at-least-once and duplicates are possible after ambiguous acknowledgement |
| DNS/registrar/provider account compromise | Infrastructure requirements call for independent DNS and account boundaries | Domain/API may become unreachable or redirected | No configured independent DNS failover or rehearsed registrar recovery evidenced |
| Secrets/key loss | Secrets are environment-configured; Pinterest tokens encrypted at rest | Credentials may become unusable even if DB is restored | Restore exact current/previous token encryption key from separately protected escrow; no escrow evidence found |

## Confirmed application recovery mechanisms

### Backend and generation
- Generation request identity, task plan, provider task IDs/outcomes and credit reservation are durable in PostgreSQL.
- Completed provider results can be rehosted after Storage failure without submitting a second billable image task when the same recovery identity remains available.
- Unknown provider outcomes are not blindly retried.
- Atomic completion keeps pin insertion and credit settlement together.

### Pinterest scheduler
- Dedicated worker process polls the authenticated backend endpoint; default interval is 30 seconds and one schedule is requested per run.
- Durable PostgreSQL claims/leases and claim-token fencing prevent stale workers from committing over newer claims.
- Stale claims without an attempt journal can be safely requeued; journaled ambiguous attempts become unknown, not blindly replayed.
- Retry is limited to explicitly retry_safe outcomes.
- Worker process and external cron are alternative wake-up mechanisms; do not enable both.
- The setup guide and prior audits state that production cron/worker activation and required production migrations have not been verified. A source implementation is not proof that a production worker is running.

### Payments and email
- Webhook fulfillment is DB-backed and idempotent; committed balances/subscriptions survive a backend restart.
- Email outbox rows survive restart; delivery dispatcher runs on startup and while backend is awake. A sleeping host delays retries.
- Pending/unknown payment outcomes require provider reconciliation; age alone is not proof of non-payment.

### Health and monitoring
- GET /health returns {ok:true}; it is a liveness response only and does not prove database, Storage, provider, or worker readiness.
- Scheduler worker logs per-run counters and errors, but the prior AUD-159 finding remains: no confirmed external heartbeat/alert for worker absence, backlog age, stale claims or unknown schedules.
- Email outbox and payment/worker inventories improve manual inspection but are not a complete monitoring/alerting system.

## Recovery sequence for a full infrastructure incident

This is a proposed operator runbook, not an executed procedure.

1. **Declare incident and freeze risky actions.** Pause deployments, production migrations, manual balance changes, checkout recreation, Pinterest retries and destructive Storage cleanup. Preserve logs and provider receipts.
2. **Establish the failure domain.** Check DNS/registrar, frontend host, backend host, database, Storage, external providers and secrets separately. Do not assume a frontend outage means data loss.
3. **Restore control plane and secrets.** Recover owner/admin access and the secret manager first. Retrieve the exact DB credentials, JWT/payment/webhook/scheduler secrets, SMTP credentials, and current/previous Pinterest token encryption keys from independent escrow. Never place secrets in Git, issue comments or chat.
4. **Restore PostgreSQL into an isolated environment.** Use the newest verified independent backup/PITR point. Apply only the reviewed migration chain; compare schema, roles, functions, grants, indexes, sequences, row counts and key financial totals.
5. **Restore object storage.** Restore object keys and bytes from independent backup; compare object counts, sizes and checksums. Verify public/private visibility and image fetch behavior before opening traffic.
6. **Reconcile cross-system state.** Compare credit ledger against balances, purchases against Prodamus receipts/webhooks, subscriptions against paid periods, generation tasks/reservations against provider outcomes, and Pinterest schedules/attempts against remote pins. Do not infer that missing local rows mean the external action never happened.
7. **Bring up backend in maintenance/read-only mode if supported.** Verify DB connectivity, encryption/decryption of a test Pinterest token, auth, Storage reads/writes, webhook signature validation and health checks. Do not enable billable generation, real payment fulfillment, or Pinterest publishing until reconciled.
8. **Bring up exactly one scheduler.** Enable either the dedicated worker or external cron, never both. Confirm heartbeat, backlog, lease renewal and unknown inventory before allowing scheduled publishing.
9. **Restore frontend and DNS.** Deploy the reviewed commit, validate API/CORS/OAuth callback/payment webhook URLs, then switch DNS only with owner approval. Keep old hosting and old DNS records available for rollback.
10. **Observe and close.** Run user journeys in staging first; after approved production cutover, monitor 5xx, auth, payment exceptions, credit ledger, Storage errors, generation recovery, schedule backlog, email outbox and costs. Record actual recovery duration and data-loss window.

## Priority gaps

### P0 — must be resolved before claiming disaster recovery
1. Independent encrypted PostgreSQL backup in a separate provider/account, with alerts and immutable/versioned retention.
2. Independent Storage backup/replication with checksum verification.
3. Separate escrow of Pinterest token encryption key and previous rotation key.
4. Successful isolated restore drill covering database, Storage, secrets, backend startup and representative end-to-end reads/decryption.
5. Written access/recovery ownership and offline emergency instructions.

### P1 — before production scale / enabling unattended publishing
1. External worker heartbeat and alerts for missing runs, backlog, stale publishing, and unknown schedules.
2. Readiness diagnostics distinct from /health liveness; never expose secret/config values.
3. Verified alternate frontend/backend deployment and DNS rollback rehearsal.
4. Staging restore rehearsal, load test, and controlled provider failure tests.
5. Documented email dead-letter review and payment reconciliation operator process.

### P2 — resilience improvements
1. Shared rate-limit store if backend runs multiple instances; current in-memory rate limiter state is process-local and resets on restart.
2. Centralized structured logs/metrics with correlation IDs and no secrets/PII.
3. Regular secret rotation rehearsal and account recovery review.
4. Cost/quota alerts so failover or retry loops cannot exceed the approved 4,000 RUB/month service budget without notice.

## RPO/RTO and readiness status

- **RPO:** unknown; no independent backup schedule or measured restore point was evidenced.
- **RTO:** unknown; no successful full restore/failover drill was evidenced.
- **Automatic failover:** not confirmed for frontend, backend, PostgreSQL, Storage or DNS.
- **Data durability:** application journals improve recovery from process interruption but do not protect against loss of the database provider/account itself.
- **Infrastructure checklist:** requirements document's 2026-11-09 baseline says 0/70 completed. No evidence in this audit justifies marking any provider migration, independent backup or restore drill complete.

## Scope and validation

- Reviewed infrastructure requirements, scheduler setup, backend startup/health, scheduler worker, generation recovery, payment/email restart audit and Pinterest worker recovery audits.
- No live provider dashboard, DNS, hosting account, database, Storage bucket or backup console was accessed.
- No restore, failover, provider request, real payment, publication, production migration, deploy, merge or data mutation was performed.
- Tests, lint, build and CI were not run.
