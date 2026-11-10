# AUD-377 — GPTunnel generation, provider uncertainty and image persistence

**Date:** 2026-11-11  
**Status:** source audit complete; no production changes  
**Scope:** GPTunnel text/image calls, durable generation plan/task journal, provider idempotency, credit reservations, image download/rehosting, Storage recovery and browser request identity.

## Executive summary

The current generation path is substantially journaled and fenced. Before billable image submission, PinPosy stores the normalized plan, stable per-task provider idempotency keys, exact model/aspect ratio and GPTunnel price quote. Credit reservations are resized to the exact quote-based user-credit amount. Provider task IDs and outcomes are persisted, and completion checks the journal against the exact saved pins and settles credits atomically.

The most important safety rule is implemented: a timeout or lost response does not prove that GPTunnel rejected a request. The request remains uncertain and must be recovered using the same idempotency identity or provider task ID. No blind second create request is permitted for a task with a durable provider task ID.

## Confirmed safeguards

### Text generation
1. Parent generation request is marked as provider-submitted before the text call.
2. Provider usage and normalized plan are saved atomically through `record_pin_generation_text_plan`.
3. Invalid model output still records text usage before failing.
4. Missing or malformed GPTunnel text usage cost is represented as NULL / `cost_missing`, not silently coerced to zero. The text response can be retained, but provider cost reconciliation remains incomplete.
5. Provider text request has a 30-second HTTP timeout. Timeout is an ambiguous outcome, not proof of no provider charge.

### Image generation
1. The exact image plan and task-specific idempotency keys are persisted before image provider submissions.
2. GPTunnel image quote must match the requested model, currency RUB and exact aspect ratio; ignored parameters are rejected.
3. User credits are reserved before billable image submission and resized to the exact quoted total.
4. Task state moves through prepared/submitting/queued/running/succeeded/failed/unknown; provider task ID is immutable once attached.
5. A known task ID is polled directly on recovery; polling never creates a replacement task.
6. Synchronous completion is journaled before returning the image result.
7. A successful provider result is persisted before Storage rehosting. If Storage fails, retry rehosts the exact journaled result rather than submitting another image task.
8. Provider task IDs, exact price, result URL and Storage URL are checked by the completion journal guard. The completion RPC atomically saves pins, debits actual cost and settles the reservation.
9. Unknown provider outcomes retain the credit reservation; no automatic TTL release risks spending credits that may still be owed.

### Image transfer and Storage
1. GPTunnel result URLs are treated as untrusted: HTTPS required, public IP/DNS validation, pinned DNS lookup, redirects disabled, proxy disabled.
2. Download has a 30-second timeout and a maximum content length of 5 MiB.
3. Image bytes are validated by file signature and MIME type before upload.
4. Image bytes are buffered in process memory; this path does not create temporary disk files.
5. Managed Storage upload is idempotent and lifecycle-claimed. Deterministic quarantined paths are not reused; at most three stable recovery paths are tried.
6. If Storage object URL retrieval or journal persistence fails, the request remains recoverable and is not blindly re-submitted to GPTunnel.

### Browser recovery
The frontend stores generation fingerprint/idempotency identity in session storage when available and retains a same-page in-memory fallback when storage is blocked. If session storage is blocked and the page is fully reloaded, the in-memory identity is lost; the backend journal still exists but the browser may no longer possess the key to retrieve it.

## Findings / operational gaps

### AUD-377-01 — Unknown provider outcomes require reconciliation, not automatic retries
GPTunnel image create timeout can occur after the provider accepted the task. The stable idempotency key and persisted task ID are essential. Do not rotate a key or submit a new task until the original provider outcome is resolved. This is an intentional safety trade-off: some work can remain pending longer to avoid duplicate provider charges.

### AUD-377-02 — Text provider cost may remain unknown
The text-generation path intentionally accepts a successful text response even if GPTunnel omits cost metadata; usage is recorded with a missing-cost marker. This preserves the plan but leaves provider spend incomplete until usage is reconciled. Do not substitute zero.

### AUD-377-03 — Provider and HTTP timeouts can exceed an interactive request budget
Provider HTTP calls use a 30-second timeout; image polling may run up to 30 polls at 3 seconds each, in addition to image download/Storage work and quote batches. A backend HTTP request can terminate before all work is complete. Correctness depends on durable journal recovery, not on the browser keeping the original connection alive.

### AUD-377-04 — Browser session-storage fallback is only same-page durable
If sessionStorage is unavailable, the in-memory request key survives component remounts within the page but not a full page reload/browser close. This limitation is documented by AUD-171 and should not be presented as cross-device recovery.

### AUD-377-05 — Live provider/Storage and applied migration state are unverified
Source review cannot establish GPTunnel account idempotency retention, provider task lookup availability/retention, actual production bucket policies, current database migration ledger, deployed backend commit or provider-side costs. Confirm required migrations 045, 046, 054, 063–071, 079, 088, 104, 106 and 121 in the target environment before relying on this recovery design.

## Operational rules

- Never retry an ambiguous GPTunnel create with a fresh idempotency key.
- For a known provider task ID, poll that exact task; do not create another.
- If provider result exists but Storage copy failed, retry Storage using the saved provider result URL and stable Storage idempotency key.
- Do not release reservations for unknown provider outcomes without exact provider reconciliation.
- Missing provider usage cost remains unknown until reconciled; never book it as zero.
- Do not promise that same-page browser-memory fallback survives a full reload when session storage is blocked.

## Validation and safety

- Source inspection and prior committed regression-test review only.
- No Node tests, SQL integration tests, lint, build, CI or browser tests were executed.
- No live GPTunnel calls, image generation, Storage requests, Supabase queries, credit changes, deployment or migration were performed.
