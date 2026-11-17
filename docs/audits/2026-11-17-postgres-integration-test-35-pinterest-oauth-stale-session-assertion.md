# PostgreSQL integration test 35/46 — stale OAuth callback assertion

Date: 2026-11-17

## Owner-provided runtime evidence

The owner supplied the complete output of `scripts/verify-integration.ps1` after synchronizing the local checkout.

- Local `main` was clean before and after the fast-forward pull.
- `HEAD = origin/main = 68d32f33a6760b27577cbe15716f0c61c97984ef`.
- The guarded runner verified PostgreSQL listener PID `15220`, data directory `X:\PinPosy-verify-pg18`, and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- The temporary role password was entered locally at the hidden prompt; no secret was supplied to the assistant or recorded here.
- Disposable database: `pinposy_sqlint_66dec8d3e0aa48e4`.
- CI upgrade fixture completed.
- All **147 migrations 010–156** completed.
- Both CI inline assertions completed.
- Ordered SQL integration tests **1–34/46 passed**.
- Test **35/46**, `pinterest-oauth.integration.sql`, failed at line 191 with: `stale OAuth callback left active credentials after token-version change`.
- Tests 36–46 were not run.
- Cleanup completed: runner terminated remaining sessions, dropped only the disposable database, and printed `Removed disposable database pinposy_sqlint_66dec8d3e0aa48e4`.

This run is an actual PostgreSQL integration failure, not a synchronization/password precondition stop. The complete owner transcript is preserved in the conversation attachment; no password is included in this report.

## Source investigation

Inspected current GitHub sources:

- `backend/test/pinterest-oauth.integration.sql`, blob `ccbf1acea19d2a2d0d12c6312755712957ccee4d`.
- `db/migrations/028_pinterest_oauth_attempt_fencing.sql`, blob `6f6d18cdadf418d847252f28fb0dd889c88c446e`.
- `db/migrations/032_pinterest_multi_account_oauth.sql`, blob `01d089e5acea0c2654ac20b847044f763f1674d2`.
- `db/migrations/055_auth_token_version.sql`, blob `45735f1c2b18f6a1e7a7d640593f97d5efa29308`.
- `db/migrations/023_revoke_sessions_after_password_reset.sql`, blob `56887896f8650d56d727e59c3c37388e73f7c37e`.
- `backend/test/postgres-integration-runner-contract.test.js`, blob `a381cd497fc199e5fcba6464c842fd5f5fc664d1`.

The SQL test reconnects the same Pinterest identity and successfully stores the active row with username `reconnected_user` and credentials `enc:reconnected-access` / `enc:reconnected-refresh`. It then starts a fresh OAuth attempt, increments the user's `token_version`, and calls `commit_pinterest_oauth_attempt_v2` with the old version.

Migration 032's active function locks and checks the OAuth attempt, then locks the PinPosy user and compares the current `users.token_version` with the callback's supplied version. On mismatch it clears the pending OAuth attempt state and returns JSON `{ok:false, reason:'stale_session'}` before any insert/update of `pinterest_accounts`.

The old test then counted *all* active Pinterest credentials for that user and required the count to be zero. That expectation contradicts the earlier successful reconnect in the same test. Rejecting an obsolete callback must not be confused with disconnecting a previously connected Pinterest account. The observed failure is therefore explained by an invalid test assertion; this source review does not establish a production OAuth defect.

## Changes published

1. Updated only `backend/test/pinterest-oauth.integration.sql`:
   - require `ok=false` and reason `stale_session`;
   - require the previously reconnected Pinterest row and its current username/access/refresh credentials to remain intact and active;
   - require that no account for `pinterest-user-old-session` was created.
   - Commit: `4e9434c8eaa72a8ff4053521716b144b2b947396`.
   - Blob: `440812c1c1c341036d78db39973333cebc1f5b6f`.

2. Added a Node source-contract test in `backend/test/postgres-integration-runner-contract.test.js` to guard the intended SQL assertion semantics and prevent reintroduction of the incorrect global-zero assertion.
   - Commit: `5b7c354f532e5a5d896edd9ca32934368b24b670`.
   - Blob: `7abd35fbe62c6db075041fbba3bd76b465057b90`.
   - The combined Node preflight was previously 45 tests; this adds one test, so the expected combined total is now 46. This count is a source expectation, not an executed result.

No production application code, database migration, fixture, CI workflow, runner, live database or production resource was changed.

## Verification status and next gates

- Owner PostgreSQL evidence: fixture PASS; migrations 010–156 PASS; two inline assertions PASS; SQL tests 1–34 PASS; test 35 FAIL; tests 36–46 NOT RUN; disposable DB cleanup PASS.
- The earlier billing webhook privilege assertion correction is now exercised successfully by test 34 in this run.
- The OAuth test correction and new Node contract assertion are **NOT RUNTIME-VERIFIED**.
- Assistant did not execute local Node, PowerShell, psql, PostgreSQL, Bash or CI commands. GitHub source reads and GitHub file updates only.
- Next owner action after syncing all documentation commits: run the three-file Node command from UA-034 and require **46/46 PASS**. If it fails, stop and send the complete output; do not run the SQL runner.
- Only after Node 46/46 PASS, rerun the unchanged guarded PostgreSQL runner. Require fixture, 147 migrations 010–156, both inline assertions, all 46/46 SQL tests, and confirmed disposable DB cleanup. Stop at the first failure.
- Nine Bash concurrency scripts remain a separate, unverified gate.
- Preserve the approved local cluster identity (PID 15220, port 55439, `X:\PinPosy-verify-pg18`). Never use production or `PIN_TRIAL`, bypass runner guards, or disclose credentials.

## Assistant action log

1. Read the owner-provided complete runner transcript.
2. Confirmed synchronization and clean worktree evidence from the transcript.
3. Classified the run as a real SQL test failure at 35/46; distinguished the 34 preceding passes, 11 unrun tests and successful disposable database cleanup.
4. Fetched the current project state, owner action log, documentation register, runner, failing SQL test, OAuth migrations and Node contract test from GitHub.
5. Traced the stale-session branch in migration 032 and compared it with the preceding successful reconnect and the final test assertion.
6. Identified the contradiction in the test expectation.
7. Changed only the SQL integration test and added a Node source-contract assertion; published both commits listed above.
8. This audit and the three project documentation updates record the owner evidence, source reasoning, exact edits, SHAs, verification limits and next action.

No local filesystem or shell was available to the assistant; no local tests or database commands were executed.

## Additional assistant tooling note

During preparation of the GitHub edits, the first orchestration attempt stopped with a JavaScript `SyntaxError`: a literal multi-line SQL block was passed to `String.match`, which interpreted it as a regular expression. This happened before any GitHub write call; no repository file was changed by that failed attempt. The edit was retried using literal `indexOf` matching with an exact-single-occurrence guard, after which the SQL test and Node contract commits were published successfully. This failed preparation attempt is recorded to preserve the assistant action history.
