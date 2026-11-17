# PostgreSQL integration test 28/46 — terminal generation journal fixture and migration contract order

Date: 2026-11-17  
Repository: `Diana-866/pinboard-ai`, branch `main`  
Owner's reported checkout for this run: `7662d856aa3b2af8870d8d44686b92331b4bc0da`

## 1. Owner-provided evidence

The owner supplied a Node assertion failure excerpt, a successful PowerShell Parser result, and the complete relevant PostgreSQL runner transcript.

- The Node excerpt is from the migration-153 contract in `backend/test/postgres-integration-runner-contract.test.js`. The expected regex searched for `pin_generation_requests`, then `pin_review_queue`, then `boards`. The actual migration orders those references as `pin_generation_requests`, `boards`, then `pin_review_queue`. The full aggregate Node test count/output was not included in this message, so no total PASS/FAIL count is claimed.
- PowerShell Parser API: **PASS, 0 syntax errors** for `scripts/verify-integration.ps1`.
- Guarded runner verified clean synchronized main at `7662d856aa3b2af8870d8d44686b92331b4bc0da`, listener PID 15220, data directory `X:\\PinPosy-verify-pg18`, and expected PostgreSQL identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable database: `pinposy_sqlint_98bf42130a244300`.
- Upgrade fixture, all **144 migrations 010–153**, and both CI inline assertions passed.
- SQL tests **1–27/46 passed**.
- Test **28/46**, `pin-image-deletion-claims.integration.sql`, failed with `generation task journal is not terminal`, raised by `guard_pin_generation_request_completion()` while the fixture attempted to mark its parent generation request completed.
- Tests 29–46 did not run.
- Cleanup succeeded: zero remaining sessions, disposable DB dropped, and removal confirmed. Runner exited nonzero because psql returned exit 3.

The owner ran the guarded SQL runner although the Node excerpt showed a contract assertion failure. Record this as a gate-order deviation. The runner's own clean-checkout and database-target guards passed; the transcript does not indicate a guard bypass or modification of the persistent PostgreSQL cluster.

## 2. Diagnosis

### 2.1 Node contract matcher order

Migration 153 retains the reference inventory introduced in migration 145. In the function body, the relevant checks appear in this source order:

1. `pin_generation_requests` result payload references;
2. `boards` cover references;
3. `pin_review_queue` payload references.

The Node contract expected the second and third entries in the reverse order. This was a stale test matcher, not a missing reference check in the SQL migration.

### 2.2 Generation task fixture was not terminal

In `backend/test/pin-image-deletion-claims.integration.sql`, the generation image lifecycle fixture inserted one `pin_generation_tasks` row without specifying `status` or `provider_outcome_status`. Migration 045 defaults task status to `prepared`. The fixture then changed the parent `pin_generation_requests.status` to `completed`.

Migration 071 intentionally rejects parent completion while any task is not terminal; it permits only `succeeded` or `failed`. It also requires the provider outcome to agree with the terminal task status. Therefore the test failed before reaching the image-reference assertion. The production guard is correct and must not be weakened.

The fixture's purpose is to prove that a durable task journal retains its image reference even after the parent request becomes terminal. A failed terminal task is appropriate for this test: set both task `status` and `provider_outcome_status` to `failed`, retain its `storage_url`, then complete the parent request with its empty successful-pin array. The deletion function checks task-journal references independently of whether the task succeeded.

## 3. Changes published

No production migration or runtime function was changed.

| Path | Commit | Final blob SHA | Purpose |
|---|---|---|---|
| `backend/test/pin-image-deletion-claims.integration.sql` | `b3fe4533d3491507c4c86530bdb377c1d7947c0c` | `01390370c8beb8250e1c1fce6845a7c4b0fe8077` | Set fixture task `status='failed'` and `provider_outcome_status='failed'` so the parent-completion guard accepts the terminal journal |
| `backend/test/postgres-integration-runner-contract.test.js` | `780a8a75efec49e45d9a502ecfb2b8261bc53d02`, then corrected by `4adb47381b2a74d7b878bf1671768f128cda73fc` | `79b884a2151dc71dec41425a758ff521326a666a` | Align reference-inventory order assertion with migration 153; final follow-up corrected JavaScript regex literal escaping |

Authoring chronology:
1. The first combined source-update attempt detected a mismatch in the exact Node matcher string before any GitHub write; no change was made by that attempt.
2. The SQL fixture update and first Node matcher update were published. Inspection of the resulting Node source showed the replacement had over-escaped the regex literal.
3. The Node contract file was re-fetched and the matcher was corrected using a raw string so the JavaScript regex literal contains the intended single backslashes. Final source was re-fetched and verified.
4. These intermediate authoring mistakes and their corrections are retained here rather than omitted from the development history.

## 4. Verification and limits

- Re-fetched the final SQL fixture from GitHub and confirmed the insert explicitly writes `'failed', 'failed'` to the task status and provider outcome columns.
- Re-fetched the final Node contract and confirmed the matcher is `/pin_generation_requests[\s\S]*?boards[\s\S]*?pin_review_queue/i`, with JavaScript regex-literal escaping intact.
- The migration-153 SQL itself remains unchanged; its complete reference inventory and permanent quarantine logic are source-verified from the preceding incident.
- The assistant did not execute Node, PowerShell, psql, PostgreSQL, or CI. The owner-provided Parser and SQL results are not a PASS for the newly updated source.
- The PostgreSQL integration suite remains **NOT PASSED**. The new fixture and Node contract need owner runtime verification. Tests 29–46 remain unexecuted.

## 5. Required owner sequence

1. Synchronize to the latest clean `origin/main`; verify `HEAD` equals `origin/main`.
2. Run the three Node contract/migration/replay tests and require a complete PASS. Stop on any failure.
3. Run the PowerShell Parser API check and require zero syntax errors.
4. Only after both gates pass, run the guarded PostgreSQL integration runner.
5. SQL integration PASS requires the fixture, all 144 migrations 010–153, both CI inline assertions, all 46 ordered SQL tests, and confirmed disposable-database cleanup.

Safety constraints remain unchanged: do not stop PID 15220, alter port 55439 or the data directory, bypass runner guards, touch `X:\\PinPosy-verify-pg18`, use production/PIN_TRIAL, or disclose passwords/tokens/.env. Do not start later suites until the full SQL integration run passes.
