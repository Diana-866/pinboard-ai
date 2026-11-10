# AUD-349 — capacity, performance and horizontal scaling review

**Date:** 2026-11-11  
**Status:** SOURCE REVIEW COMPLETE  
**Load test / live metrics:** not available; no capacity number can be responsibly claimed.

## Executive summary

The source is designed around a stateless Express API plus Supabase HTTP APIs and durable PostgreSQL journals. It can be deployed as multiple web instances in principle, but the current in-process rate-limit stores do not provide shared quotas across instances. There is no evidence of measured throughput, concurrent-user capacity, latency SLOs, saturation thresholds, or live Supabase/Render/Vercel quota headroom.

Do not translate the number of API requests or AI limits into a user-capacity estimate. One user may generate many concurrent DB and provider operations; an idle user may generate almost none. Capacity depends on actual workload mix, provider latency, database plan limits, storage egress and host CPU/RAM.

## Findings

### 1. Backend process and horizontal scaling

- Express API is a single Node process per deployment instance; no explicit cluster/process manager is defined in the backend package scripts.
- Most durable business state is in Supabase/PostgreSQL rather than process memory, which is a good prerequisite for stateless web replicas.
- Several rate limiters use express-rate-limit's default MemoryStore. This includes authentication, verification, AI, payment creation, admin, image upload and Pinterest route budgets. AI/Pinterest comments explicitly note that a shared store is required across instances.
- Consequence: with N instances, the effective aggregate request allowance may approach N times the configured per-process limit, depending on load balancing and key distribution. Counters reset on process restart.
- Express trust proxy is configured to one hop. The real proxy chain and host configuration must be verified before multi-instance rollout; incorrect proxy trust can collapse client IP isolation or allow spoofed forwarding metadata.
- No global concurrency/backpressure gate is evidenced for expensive AI/site-analysis or upload work. Per-account rate limits restrict request frequency but do not necessarily cap simultaneous in-flight provider calls.

**Priority:** P1 before adding multiple web replicas; P0 if per-user limits are relied on as a hard global spend/security ceiling.

### 2. Database and Supabase

- Backend uses @supabase/supabase-js and PostgREST/Storage APIs, not a direct pg connection pool in the inspected backend dependency manifest.
- Therefore there is no application-owned PostgreSQL pool size to tune here. The effective concurrency/connection behavior is mediated by Supabase API infrastructure and its project/plan limits.
- Auth middleware performs a database lookup for the user token version on protected requests. /me also reads the user and effective tariff state. This adds DB/API calls to common authenticated request paths.
- Generation, payment, Pinterest schedule and image lifecycle use durable RPCs/transactions. This favors correctness but makes database API latency and RPC capacity important.
- Source migrations include indexes/constraints for idempotency, ownership, claims, and reconciliation. Source cannot establish whether every migration is applied in production or whether query plans remain efficient at real data volume.
- No live table sizes, index usage, slow-query log, database CPU, IOPS, API rate-limit headers, connection pressure or plan quota were available.

**Priority:** P0 to obtain a verified backup/restore and production schema baseline; P1 to capture database metrics and query plans before sizing.

### 3. Expensive request paths and resource pressure

- AI routes call GPTunnel synchronously from the web request path in inspected flows. The client waits while the backend polls or processes the provider outcome; this ties up request/connection capacity for the duration.
- Site analysis fetches external websites with a 12-second HTTP timeout and 2 MiB response cap, then calls the text provider. Concurrent requests can consume outbound sockets and parsing CPU.
- Image upload uses Multer memory storage with a 5 MiB per-file cap and one file per request. Each concurrent upload temporarily holds the full file buffer in process memory, in addition to parsing/network overhead.
- Rehosting provider images downloads up to the configured image size and then uploads to Storage; this consumes memory, network bandwidth and outbound sockets.
- No explicit process-wide semaphore, queue admission policy, or overload response was found in the reviewed request paths.
- The Pinterest scheduler worker intentionally processes one schedule per request and polls at a default 30-second interval. It is a conservative throughput choice; raising it or running multiple workers should be preceded by provider rate-limit and duplicate-claim tests.

**Priority:** P1 introduce bounded concurrency/admission controls for billable AI and memory-heavy uploads; measure before tuning.

### 4. Worker throughput

- scheduleWorker.js uses one-row batches and one active tick per process. Poll interval defaults to 30 seconds; request timeout defaults to 120 seconds, capped below the 20-minute stale-claim window.
- This protects the system from uncontrolled parallel publication, but maximum schedule throughput is inherently bounded by the interval plus request duration. A slow Pinterest call can leave the worker occupied until timeout.
- Multiple worker instances may contend safely only insofar as DB claim fencing and provider semantics hold; do not increase worker count without verifying the deployed migrations and running concurrency tests against a staging database.
- No measured backlog drain rate, queue age, heartbeat alert, or target publishing SLA was evidenced.

### 5. Frontend and deployment

- Frontend package exposes Vite build, TypeScript lint and utility tests. It is a static React SPA and can be served by a CDN; backend capacity is not the same as frontend page-view capacity.
- No production CDN cache policy, bundle performance report, Core Web Vitals, or frontend traffic profile was available in this repository review.
- The latest PR check still reports Vercel build-rate-limit; this is a platform quota/build-rate issue in the check target, not a measured application performance result.

### 6. Cost and provider limits

- Current live plan limits, usage, billing, quotas, egress and overage behavior cannot be established from source.
- GPTunnel is usage-priced; image/text volume can dominate marginal cost even if hosting is free.
- A second backend instance, shared Redis/rate-limit store, independent backup, and monitoring can add recurring cost. No provider selection or paid resource change was made.
- Keep the previously approved service ceiling of 4,000 RUB/month as a hard constraint; get current written prices and billing behavior before selecting components.

## Capacity conclusion

| Scenario | What can be stated now |
|---|---|
| 100 registered users | Not a capacity test. Concurrent active workload unknown. |
| 500 registered users | Cannot certify without workload profile and load test. |
| 1,000 registered users | Cannot certify without measured DB/API/provider limits and queue behavior. |
| Concurrent AI generation | No measured safe concurrency; current rate limiter is per-process and no global semaphore was found. |
| Pinterest schedules | One row per worker request; no measured sustainable posts/hour or backlog drain rate. |
| Image uploads | 5 MiB per file in memory; safe concurrent count depends on actual host RAM and traffic. |

No numeric concurrent-user guarantee is made by this audit.

## Recommended staged capacity plan

### Stage A — instrument current single instance (before adding infrastructure)
1. Record host CPU/RAM, event-loop lag, heap/RSS, request concurrency, p50/p95/p99 latency and 4xx/5xx by route.
2. Record Supabase DB/API latency, CPU, storage, egress, slow queries, table/index sizes, and quota/limit events.
3. Add request correlation IDs and redact credentials, tokens, payment data and personal data from logs.
4. Track GPTunnel spend and latency by operation/model; measure image bytes, upload duration and Storage egress.
5. Track scheduler heartbeat, oldest due schedule age, batch duration, unknown count and retry-safe count.

### Stage B — protect expensive work
1. Add bounded in-flight concurrency for AI provider submissions and image upload/rehost.
2. Return explicit 429/503 with Retry-After when capacity is exhausted; do not silently queue unbounded work in memory.
3. Keep durable PostgreSQL task journals as source of truth for accepted billable operations.
4. Preserve unknown-outcome fences; no automatic retry of ambiguous paid provider requests.
5. Set upload concurrency based on measured memory headroom, not guessed user counts.

### Stage C — prepare horizontal scaling
1. Move all security/spend-sensitive rate-limit counters to a shared store with atomic increments and TTL.
2. Validate proxy trust and stable client IP derivation at the load balancer.
3. Ensure no business-critical state depends on process memory; review all caches, timers and single-flight maps.
4. Keep web replicas stateless; run Pinterest worker separately and deliberately scale it only after staging concurrency tests.
5. Verify DB/RPC capacity, indexes and provider rate limits before increasing replicas.

### Stage D — controlled load test
1. Create synthetic staging data and separate staging credentials for all providers.
2. Test realistic mixes: browsing, auth, board/pin CRUD, image upload, AI text, AI image, scheduling and payment webhook simulation.
3. Run step-load and spike tests at 1x/2x/5x expected peak; never use production payment or real Pinterest publishing for load generation.
4. Measure error rate, p95/p99, CPU/RAM, event-loop lag, DB latency/CPU, provider throttles, queue age and cost per completed workflow.
5. Establish a safe operating point below saturation and a documented rollback threshold.

## Acceptance gates before increasing capacity

- Shared rate limits tested across at least two API instances.
- Explicit bounded concurrency for billable AI and memory-heavy upload paths.
- Verified production migration state and DB index/query-plan review.
- Worker heartbeat and backlog alerts active.
- Load test run in staging with reproducible report and no financial/publication side effects.
- Cost forecast remains within 4,000 RUB/month or is separately approved.
- No deploy, migration, worker activation, or paid plan change performed by this audit.

## Validation and limitations

- Reviewed backend package/dependencies, Supabase client initialization, Express middleware/rate limits, image upload/rehosting, generation/provider recovery, Pinterest worker and frontend package scripts.
- No production account, provider dashboard, metrics, database, load test, CI, build, lint or test execution was performed.
- Exact hosting resources, plan quotas, traffic, concurrency, database size, provider limits and monthly costs remain unknown.
