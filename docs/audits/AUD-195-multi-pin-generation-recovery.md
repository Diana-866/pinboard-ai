# AUD-195 — Recovery of partially submitted multi-pin generations

## Finding
The generation journal writes a provider task ID together with its first provider status callback. The backend marks a task `submitting` immediately before the provider create request. If a task ID is present while the persisted status remains `submitting` (for example, after a state transition was interrupted or an older journal row was produced), recovery previously treated it as if it had no provider task ID and called the provider create endpoint again.

The provider idempotency key is an important secondary safeguard, but recovery should prefer the authoritative provider task ID and poll it directly. Reissuing a create request unnecessarily depends on the provider's idempotency retention and can create avoidable billable-boundary traffic.

## Change
- `backend/pins.js`: treat `submitting` with a persisted `provider_task_id` as a recoverable task and call `waitForImageTask` rather than `generateImage`.
- `backend/test/pins-provider-boundary.test.js`: regression test proves the task is polled and no new create call is made.
- No schema or migration change is required.

## Expected user impact
If a generation contains several images and the backend restarts while one image is in an ambiguous submission state, any known provider task ID is now used to check the existing task. Already completed images continue to be recovered from the journal; the backend avoids another create request for this task.

## Verification and safety
- Tests are added but have not yet been executed in this environment.
- No provider requests, production data, migrations, deployments, or payments were run.
