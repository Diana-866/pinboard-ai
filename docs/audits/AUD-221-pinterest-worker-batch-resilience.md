# AUD-221 — Keep Pinterest schedule batches alive across database transport failures

## Finding
The schedule worker awaited publication-journal lookup and schedule-state persistence without catching rejected transport promises inside the per-schedule loop. A network-level rejection could escape the per-item handler, abort the entire worker request, and leave the remaining already-claimed schedules waiting for stale-claim recovery. The same lookup failure must never be interpreted as proof that Pinterest did not create a pin.

## Change
- Added pure `buildScheduleWorkerFailureState` to centralize conservative failure classification, bounded retries, and retry timestamps.
- Wrapped publication-journal lookup in a per-item try/catch. Both returned Supabase errors and rejected transport promises are classified as unknown and cannot authorize retry.
- Wrapped schedule-state persistence in a per-item try/catch. A failed write is reported as unknown while the worker continues to the next claimed schedule; the current claim remains fenced for existing stale-claim recovery.
- Added tests for lookup transport failure, explicitly safe retries, retry-limit exhaustion, and confirmed publication winning over later worker errors.

## User impact
A temporary database/network failure while handling one scheduled pin no longer prevents the worker from attempting the other jobs in its batch. If the publication journal cannot be read, PinPosy keeps the outcome unknown and does not risk creating a duplicate Pinterest pin. If status persistence fails, the current row remains fenced and is left for the existing recovery process.

## Verification
Changed files were reviewed through GitHub after writing. Node tests, full backend suite, integration SQL, lint, and deployment build were not run in this environment. No production database, Pinterest API, deployment, or merge operation was performed.
