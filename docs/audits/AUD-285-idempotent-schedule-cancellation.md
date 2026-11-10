# AUD-285 — make schedule cancellation safely repeatable

- The cancellation endpoint previously returned HTTP 409 when a repeated request found the schedule already marked `cancelled`. If the first cancellation committed but its response was lost, the client could not distinguish that success from a failed cancellation.
- The endpoint now treats an already-cancelled schedule owned by the authenticated user as an idempotent success and returns its persisted representation.
- It repeats the guarded image-reference cleanup on that path. `deletePinImageIfUnreferenced` rechecks durable references, so this does not bypass the image lifecycle safeguards.
- The conditional `UPDATE ... WHERE status = 'scheduled'` remains the cancellation linearization point. A schedule already claimed by the worker (`publishing`) or published is still rejected; ownership scope is unchanged.
- Read-back verification is required after the commit. Automated tests, lint, typecheck, and build have not been executed in this environment. No production DB change, deployment, or merge.
